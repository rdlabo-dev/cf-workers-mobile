import UIKit
import SwiftUI
import WebKit
import Capacitor
import WorkersCapacitor

/// Embeds a Workers application in an ordinary UIKit application.
/// `assets` is the directory containing the generated application's index.html.
@MainActor public final class WorkersViewController: UIViewController {
    private var runtime: EmbeddedRuntimeController?
    private var closing: Task<Void, Error>?
    public private(set) var startupError: String?
    /// Called after failed startup has released the embedded runtime.
    public var onStartupError: ((String) -> Void)?

    public init(assets: URL) throws {
        guard assets.isFileURL,
              FileManager.default.fileExists(atPath: assets.appendingPathComponent("index.html").path) else {
            throw CocoaError(.fileReadNoSuchFile)
        }
        runtime = EmbeddedRuntimeController(assets: assets)
        super.init(nibName: nil, bundle: nil)
        runtime?.onStartupFailure = { [weak self] message in
            guard let self, self.startupError == nil else { return }
            self.startupError = message
            Task { @MainActor in
                try? await self.close()
                self.onStartupError?(message)
            }
        }
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("Use init(assets:)") }

    public override func viewDidLoad() {
        super.viewDidLoad()
        guard let runtime else { return }
        addChild(runtime)
        runtime.view.frame = view.bounds
        runtime.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(runtime.view)
        runtime.didMove(toParent: self)
    }

    /// Await before removing the controller. Disposes JavaScript in its owning
    /// runtime realm, then releases document views, sockets, and native bridges.
    /// A closed controller is terminal; create a new controller to open again.
    public func close() async throws {
        if let closing { return try await closing.value }
        guard let runtime else { return }
        let task = Task { @MainActor in
            var failure: Error?
            if let webView = runtime.webView {
                do {
                    try await Self.disposeJavaScript(in: webView)
                } catch { failure = error }
            }
            await runtime.workers.shutdown()
            runtime.webView?.configuration.userContentController.removeScriptMessageHandler(forName: "WorkersNativeStartupFailure")
            runtime.webView?.stopLoading()
            runtime.willMove(toParent: nil)
            runtime.viewIfLoaded?.removeFromSuperview()
            runtime.removeFromParent()
            self.runtime = nil
            if let failure { throw failure }
        }
        closing = task
        try await task.value
    }

    private static func disposeJavaScript(in webView: WKWebView) async throws {
        try await withCheckedThrowingContinuation { continuation in
            let waiter = DisposalWaiter(continuation)
            webView.callAsyncJavaScript(
                "if (typeof globalThis.__workersNativeDispose === 'function') { await globalThis.__workersNativeDispose(); }",
                arguments: [:], in: nil, in: .page
            ) { result in
                switch result {
                case .success: waiter.finish(nil)
                case .failure(let error): waiter.finish(error)
                }
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
                waiter.finish(URLError(.timedOut))
            }
        }
    }
}

@MainActor private final class DisposalWaiter {
    private var continuation: CheckedContinuation<Void, Error>?
    init(_ continuation: CheckedContinuation<Void, Error>) { self.continuation = continuation }
    func finish(_ error: Error?) {
        guard let continuation else { return }
        self.continuation = nil
        if let error { continuation.resume(throwing: error) }
        else { continuation.resume() }
    }
}

private final class EmbeddedRuntimeController: CAPBridgeViewController {
    let workers = WorkersCapacitorPlugin()
    private let assets: URL
    var onStartupFailure: ((String) -> Void)?
    private var failureHandler: StartupFailureHandler?
    init(assets: URL) { self.assets = assets; super.init(nibName: nil, bundle: nil) }
    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("Use init(assets:)") }
    override func instanceDescriptor() -> InstanceDescriptor {
        let descriptor = InstanceDescriptor(at: assets, configuration: nil, cordovaConfiguration: nil)
        descriptor.handleApplicationNotifications = false
        descriptor.contentInsetAdjustmentBehavior = .automatic
        return descriptor
    }
    override func capacitorDidLoad() {
        let assets = assets
        workers.documentDescriptorFactory = {
            let descriptor = InstanceDescriptor(at: assets, configuration: nil, cordovaConfiguration: nil)
            descriptor.handleApplicationNotifications = false
            descriptor.contentInsetAdjustmentBehavior = .automatic
            return descriptor
        }
        bridge?.registerPluginInstance(workers)
        guard let content = webView?.configuration.userContentController else { return }
        let handler = StartupFailureHandler { [weak self] message in self?.onStartupFailure?(message) }
        failureHandler = handler
        content.add(handler, name: "WorkersNativeStartupFailure")
        content.addUserScript(WKUserScript(
            source: "globalThis.WorkersNativeHost = { failed: message => window.webkit.messageHandlers.WorkersNativeStartupFailure.postMessage(String(message)) };",
            injectionTime: .atDocumentStart, forMainFrameOnly: true))
    }
    override func setStatusBarDefaults() {}
    override func setScreenOrientationDefaults() {}
}

private final class StartupFailureHandler: NSObject, WKScriptMessageHandler {
    private let failed: (String) -> Void
    init(_ failed: @escaping (String) -> Void) { self.failed = failed }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, let value = message.body as? String else { return }
        failed(value)
    }
}

/// SwiftUI host. Construct the controller once and retain it for the view's lifetime.
@MainActor public struct WorkersView: UIViewControllerRepresentable {
    public let controller: WorkersViewController
    public init(controller: WorkersViewController) { self.controller = controller }
    public func makeUIViewController(context: Context) -> WorkersViewController { controller }
    public func updateUIViewController(_ uiViewController: WorkersViewController, context: Context) {}
    public static func dismantleUIViewController(_ uiViewController: WorkersViewController, coordinator: ()) {
        Task { try? await uiViewController.close() }
    }
}
