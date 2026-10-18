import Foundation
import Capacitor

final class NetworkBridge {
    private let sockets = SocketBridge()
    private let callbackLock = NSLock()
    private var valid = true
    func invalidate() { callbackLock.lock(); valid = false; callbackLock.unlock() }
    private func resolve(_ call: CAPPluginCall, _ value: PluginCallResultData = [:]) {
        callbackLock.lock(); defer { callbackLock.unlock() }
        if valid { call.resolve(value) }
    }
    private func reject(_ call: CAPPluginCall, _ message: String) {
        callbackLock.lock(); defer { callbackLock.unlock() }
        if valid { call.reject(message) }
    }
    private func socketResult(_ call: CAPPluginCall) -> SocketBridge.Completion {
        return { result in
            switch result {
            case .success(let value): self.resolve(call, value)
            case .failure(let error): self.reject(call, String(describing: error))
            }
        }
    }
    func socketWatch(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { reject(call, "Missing socket"); return }
        sockets.watch(id: id, completion: socketResult(call))
    }
    func socketOpen(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let host = call.getString("host"), let port = call.getInt("port") else { reject(call, "Invalid socket open"); return }
        sockets.open(id: id, host: host, port: port, tls: call.getBool("tls") ?? false, completion: socketResult(call))
    }
    func socketWrite(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let encoded = call.getString("chunk"), encoded.utf8.count <= 87384, let data = Data(base64Encoded: encoded) else { reject(call, "Invalid socket write"); return }
        sockets.write(id: id, data: data, end: false, completion: socketResult(call))
    }
    func socketEnd(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { reject(call, "Missing socket"); return }
        sockets.write(id: id, data: nil, end: true, completion: socketResult(call))
    }
    func socketRead(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { reject(call, "Missing socket"); return }
        sockets.read(id: id, count: call.getInt("maxBytes") ?? 65536, completion: socketResult(call))
    }
    func socketClose(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { reject(call, "Missing socket"); return }
        sockets.close(id: id, completion: socketResult(call))
    }
    func closeAll() async { await sockets.closeAll() }
    func shutdown() async { await sockets.closeAll(stopping: true) }
}
