import Capacitor

@objc(BridgeProbePlugin)
public final class BridgeProbePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BridgeProbePlugin"
    public let jsName = "BridgeProbe"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "echo", returnType: CAPPluginReturnPromise)
    ]
    @objc func echo(_ call: CAPPluginCall) {
        guard let value = call.getString("value") else { call.reject("Missing value"); return }
        call.resolve(["value": value, "platform": "ios"])
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            self.notifyListeners("echoed", data: ["value": value, "platform": "ios"])
        }
    }
}
