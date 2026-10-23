import Capacitor
import WebKit

@objc(WorkersCapacitorPlugin)
public final class WorkersCapacitorPlugin: CAPPlugin, CAPBridgedPlugin {
    /// Optional embedding configuration; ordinary Capacitor applications keep their existing configuration.
    public var documentDescriptorFactory: (() -> InstanceDescriptor)?
    public let identifier = "WorkersCapacitorPlugin"
    public let jsName = "WorkersCapacitor"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "cookiesGet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cookiesSet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "socketWatch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "socketVerifyTls", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "socketStartTls", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "socketOpen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "socketWrite", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "socketEnd", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "socketRead", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "socketClose", returnType: CAPPluginReturnPromise)
    ]
    private var network = NetworkBridge()
    private var networkLifecycle: NetworkLifecycle?
    public override func load() {
        guard let content = webView?.configuration.userContentController else { return }
        let lifecycle = NetworkLifecycle { [weak self] in
            guard let bridge = self?.bridge as? CapacitorBridge else { return }
            bridge.dispatchQueue.async { [weak self] in
                guard let self else { return }
                let previous = self.network
                previous.invalidate()
                self.network = NetworkBridge()
                Task { await previous.shutdown() }
            }
        }
        networkLifecycle = lifecycle
        content.add(lifecycle, name: "WorkersCapacitorNetworkReset")
        content.addUserScript(WKUserScript(
            source: "window.webkit.messageHandlers.WorkersCapacitorNetworkReset.postMessage(null)",
            injectionTime: .atDocumentStart, forMainFrameOnly: true
        ))
    }
    private var documentController: DocumentBridgeController?
    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let bridge = self.bridge, let parent = bridge.viewController, let host = bridge.webView else { call.reject("Missing Capacitor bridge"); return }
            guard self.documentController == nil else { call.reject("Document rendering already started"); return }
            guard let entry = call.getString("entry"), entry.hasPrefix("/"), !entry.hasPrefix("//"), !entry.contains("\\"),
                  let baseURL = call.getString("baseURL"), let assets = call.getArray("assets", String.self), let script = call.getString("pageScript"), !script.isEmpty else { call.reject("Invalid document configuration"); return }
            let child = DocumentBridgeController()
            child.embeddedDescriptorFactory = self.documentDescriptorFactory
            child.runtimeHost = host
            child.localURL = bridge.config.localURL
            child.settings = ["entry": entry, "baseURL": baseURL, "assets": assets, "pageScript": script]
            self.documentController = child
            parent.addChild(child)
            child.view.frame = parent.view.bounds
            child.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            parent.view.addSubview(child.view)
            child.didMove(toParent: parent)
            call.resolve()
        }
    }
    @objc func stop(_ call: CAPPluginCall) {
        let owner = network
        DispatchQueue.main.async { [weak self] in
            guard let self else { call.resolve(); return }
            self.close()
            Task { await owner.closeAll(); call.resolve() }
        }
    }
    @objc func socketVerifyTls(_ call: CAPPluginCall) { network.socketVerifyTls(call) }
    @objc func socketStartTls(_ call: CAPPluginCall) { network.socketStartTls(call) }
    @objc func socketWatch(_ call: CAPPluginCall) { network.socketWatch(call) }
    @objc func socketOpen(_ call: CAPPluginCall) { network.socketOpen(call) }
    @objc func socketWrite(_ call: CAPPluginCall) { network.socketWrite(call) }
    @objc func socketEnd(_ call: CAPPluginCall) { network.socketEnd(call) }
    @objc func socketRead(_ call: CAPPluginCall) { network.socketRead(call) }
    @objc func socketClose(_ call: CAPPluginCall) { network.socketClose(call) }
    // Use WebKit's persistent remote-origin jar, never the document's cookies.
    private func cookieURL(_ call: CAPPluginCall) -> URL? {
        guard let value = call.getString("url"), let url = URL(string: value),
              url.scheme == "https", url.host != nil, url.user == nil, url.password == nil else {
            call.reject("Cookies require an HTTPS URL without credentials"); return nil
        }
        return url
    }
    @objc func cookiesGet(_ call: CAPPluginCall) {
        guard let url = cookieURL(call), let host = url.host?.lowercased() else { return }
        DispatchQueue.main.async {
            WKWebsiteDataStore.default().httpCookieStore.getAllCookies { cookies in
                let path = url.path.isEmpty ? "/" : url.path
                let matching = cookies.filter { cookie in
                    let domain = cookie.domain.lowercased()
                    let domainMatch = domain.hasPrefix(".")
                        ? (host == String(domain.dropFirst()) || host.hasSuffix(domain)) : host == domain
                    let pathMatch = path == cookie.path || (path.hasPrefix(cookie.path) && (cookie.path.hasSuffix("/") || path.dropFirst(cookie.path.count).hasPrefix("/")))
                    return domainMatch && pathMatch && (cookie.expiresDate == nil || cookie.expiresDate! > Date())
                }.sorted { $0.path.count > $1.path.count }
                call.resolve(["cookie": matching.map { "\($0.name)=\($0.value)" }.joined(separator: "; ")])
            }
        }
    }
    @objc func cookiesSet(_ call: CAPPluginCall) {
        guard let url = cookieURL(call) else { return }
        guard let values = call.getArray("cookies", String.self) else { call.reject("Invalid remote cookies"); return }
        DispatchQueue.main.async {
            let store = WKWebsiteDataStore.default().httpCookieStore
            // Process sequentially: duplicate names in a response obey header order.
            func save(_ index: Int) {
                if index == values.count { call.resolve(); return }
                let cookies = HTTPCookie.cookies(withResponseHeaderFields: ["Set-Cookie": values[index]], for: url)
                func insert(_ offset: Int) {
                    if offset == cookies.count { save(index + 1); return }
                    let cookie = cookies[offset]
                    guard cookie.domain.lowercased() == url.host?.lowercased() else { insert(offset + 1); return }
                    if let expiry = cookie.expiresDate, expiry <= Date() {
                        store.delete(cookie) { insert(offset + 1) }
                    } else { store.setCookie(cookie) { insert(offset + 1) } }
                }
                insert(0)
            }
            save(0)
        }
    }
    private func close() {
        guard let child = documentController else { return }
        child.close(); child.willMove(toParent: nil); child.view.removeFromSuperview(); child.removeFromParent()
        documentController = nil
    }
    /// Releases the native resources after the owning JavaScript runtime has disposed.
    @MainActor public func shutdown() async {
        close()
        await network.shutdown()
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "WorkersCapacitorNetworkReset")
        networkLifecycle = nil
    }
    deinit {
        documentController?.close()
        let network = network
        Task { await network.shutdown() }
    }
}

// The handler does not retain the plugin. A new main-frame document receives a
// fresh network owner before its application scripts can open connections.
private final class NetworkLifecycle: NSObject, WKScriptMessageHandler {
    private let reset: () -> Void
    init(reset: @escaping () -> Void) { self.reset = reset }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame else { return }
        reset()
    }
}
