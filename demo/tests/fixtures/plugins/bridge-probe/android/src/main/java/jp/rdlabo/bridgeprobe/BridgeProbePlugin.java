package jp.rdlabo.bridgeprobe;

import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BridgeProbe")
public class BridgeProbePlugin extends Plugin {
    @PluginMethod public void echo(PluginCall call) {
        String value = call.getString("value");
        if (value == null) { call.reject("Missing value"); return; }
        JSObject result = new JSObject();
        result.put("value", value);
        result.put("platform", "android");
        call.resolve(result);
        new Handler(Looper.getMainLooper()).postDelayed(() -> notifyListeners("echoed", result), 50);
    }
}
