import Foundation
import Network
import Capacitor

/// TCP byte transport. All state and completions belong to one serial queue.
final class SocketBridge: @unchecked Sendable {
    private final class Connection: @unchecked Sendable {
        let id: String
        let transport: NWConnection
        var opening: ((Result<PluginCallResultData, Error>) -> Void)?
        var reading: ((Result<PluginCallResultData, Error>) -> Void)?
        var writing: ((Result<PluginCallResultData, Error>) -> Void)?
        var closeWaiters: [() -> Void] = []
        var cancelled = false
        var reset = false
        var releaseRequested = false
        var watching: Completion?
        var buffer = Data()
        var receiving = false
        var readCount = 65536
        var ready = false
        var closed = false
        var eof = false
        var ended = false
        init(_ id: String, _ transport: NWConnection) { self.id = id; self.transport = transport }
    }
    private enum Failure: Error { case closed, invalid, busy }
    private let queue = DispatchQueue(label: "jp.rdlabo.capacitorworkers.sockets")
    private var values: [String: Connection] = [:]
    private var stopped = false
    typealias Completion = (Result<PluginCallResultData, Error>) -> Void
    private func close(_ value: Connection, error: Error = Failure.closed, completion: (() -> Void)? = nil) {
        if let completion {
            value.releaseRequested = true
            value.closeWaiters.append(completion)
        }
        guard !value.closed else { if value.cancelled { finishClose(value) }; return }
        if case .posix(.ECONNRESET)? = error as? NWError { value.reset = !value.releaseRequested }
        value.closed = true
        value.buffer = Data()
        value.opening?(.failure(error)); value.opening = nil
        // The pinned Workers transport reports peer reset as EOF to readers.
        value.reading?(value.reset ? .success(["eof": true, "reset": true]) : .failure(error)); value.reading = nil
        value.writing?(.failure(error)); value.writing = nil
        value.watching?(value.reset ? .success(["reset": true]) : .failure(error)); value.watching = nil
        if value.cancelled { finishClose(value) } else { value.transport.cancel() }
    }
    private func finishClose(_ value: Connection) {
        if value.reset && !value.releaseRequested { return }
        values.removeValue(forKey: value.id)
        let waiters = value.closeWaiters; value.closeWaiters.removeAll()
        for waiter in waiters { waiter() }
    }
    func open(id: String, host: String, port: Int, tls: Bool, completion: @escaping Completion) {
        queue.async {
            guard !self.stopped, !id.isEmpty, !host.isEmpty, port > 0, port <= 65535,
                  self.values[id] == nil, let endpointPort = NWEndpoint.Port(rawValue: UInt16(port)) else { completion(.failure(Failure.invalid)); return }
            let transport = NWConnection(host: NWEndpoint.Host(host), port: endpointPort, using: tls ? .tls : .tcp)
            let value = Connection(id, transport)
            value.opening = completion
            self.values[id] = value
            transport.stateUpdateHandler = { [weak self, weak value] state in
                guard let self, let value else { return }
                if case .cancelled = state {
                    value.cancelled = true
                    value.transport.stateUpdateHandler = nil
                    // A naturally completed duplex can cancel before JS asks
                    // for its final EOF. Retain buffered data and that EOF.
                    if !value.closed && value.eof { self.notifyEnd(value); return }
                    self.close(value)
                    self.finishClose(value)
                    return
                }
                guard !value.closed else { return }
                switch state {
                case .ready:
                    value.ready = true
                    let remote = host.contains(":") ? "[\(host)]:\(port)" : "\(host):\(port)"
                    value.opening?(.success(["remoteAddress": remote])); value.opening = nil
                    self.pump(value)
                case .waiting(let error), .failed(let error):
                    // Once EOF and the final send have completed, a late
                    // NW failure must not erase the EOF waiting for JS.
                    if value.eof && value.ended { value.transport.cancel(); return }
                    self.close(value, error: error)
                default: break
                }
            }
            transport.start(queue: self.queue)
        }
    }
    func watch(id: String, completion: @escaping Completion) {
        queue.async {
            if let value = self.values[id], value.reset { completion(.success(["reset": true])); return }
            guard let value = self.values[id], !value.closed, value.ready else { completion(.failure(Failure.closed)); return }
            guard value.watching == nil else { completion(.failure(Failure.busy)); return }
            if value.eof && value.buffer.isEmpty { completion(.success([:])); return }
            value.watching = completion
        }
    }
    private func notifyEnd(_ value: Connection) {
        if value.eof && value.buffer.isEmpty { value.watching?(.success([:])); value.watching = nil }
    }
    private func drain(_ value: Connection) {
        if let reply = value.reading {
            if !value.buffer.isEmpty {
                let data = value.buffer.prefix(value.readCount)
                value.buffer.removeFirst(data.count)
                value.reading = nil
                reply(.success(["chunk": Data(data).base64EncodedString()]))
            } else if value.eof { value.reading = nil; reply(.success(["eof": true])) }
        }
        notifyEnd(value)
        pump(value)
    }
    // One bounded native receive also observes FIN/reset while JS is paused.
    private func pump(_ value: Connection) {
        guard value.ready, !value.closed, !value.receiving, !value.eof, value.buffer.isEmpty else { return }
        value.receiving = true
        value.transport.receive(minimumIncompleteLength: 1, maximumLength: 65536) { data, _, complete, error in
            value.receiving = false
            guard !value.closed else { return }
            if let error { self.close(value, error: error); return }
            value.eof = complete
            value.buffer = data ?? Data()
            if value.buffer.isEmpty && !complete { self.close(value, error: Failure.invalid); return }
            self.drain(value)
        }
    }
    func read(id: String, count: Int, completion: @escaping Completion) {
        queue.async {
            guard count > 0, count <= 65536 else { completion(.failure(Failure.invalid)); return }
            if let value = self.values[id], value.reset { completion(.success(["eof": true, "reset": true])); return }
            guard let value = self.values[id], !value.closed, value.ready else { completion(.failure(Failure.closed)); return }
            guard value.reading == nil else { completion(.failure(Failure.busy)); return }
            value.reading = completion; value.readCount = count
            self.drain(value)
        }
    }
    func write(id: String, data: Data?, end: Bool, completion: @escaping Completion) {
        queue.async {
            if end, let value = self.values[id], value.reset { completion(.success(["reset": true])); return }
            guard let value = self.values[id], !value.closed, value.ready else { completion(.failure(Failure.closed)); return }
            guard value.writing == nil else { completion(.failure(Failure.busy)); return }
            if value.ended { completion(end ? .success([:]) : .failure(Failure.closed)); return }
            guard end || (data != nil && data!.count <= 65536) else { completion(.failure(Failure.invalid)); return }
            value.ended = end
            value.writing = completion
            value.transport.send(content: data, contentContext: end ? .finalMessage : .defaultMessage, isComplete: end, completion: .contentProcessed { error in
                guard !value.closed else { return }
                let reply = value.writing; value.writing = nil
                if let error, !(end && value.eof) { reply?(.failure(error)); self.close(value, error: error) }
                else { reply?(.success([:])) }
            })
        }
    }
    func close(id: String, completion: @escaping Completion) {
        queue.async {
            if let value = self.values[id] {
                self.close(value, completion: { completion(.success([:])) })
            } else { completion(.success([:])) }
        }
    }
    func closeAll(stopping: Bool = false) async {
        await withCheckedContinuation { continuation in
            queue.async {
                self.stopped = self.stopped || stopping
                let closing = Array(self.values.values)
                if closing.isEmpty { continuation.resume(); return }
                var remaining = closing.count
                for value in closing {
                    self.close(value, completion: {
                        remaining -= 1
                        if remaining == 0 { continuation.resume() }
                    })
                }
            }
        }
    }
}
