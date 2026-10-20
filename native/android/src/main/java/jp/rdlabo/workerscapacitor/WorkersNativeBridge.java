package jp.rdlabo.workerscapacitor;

import android.webkit.WebView;
import androidx.appcompat.app.AppCompatActivity;
import com.getcapacitor.Bridge;
import com.getcapacitor.CapConfig;
import com.getcapacitor.Plugin;
import com.getcapacitor.cordova.MockCordovaInterfaceImpl;
import com.getcapacitor.cordova.MockCordovaWebViewImpl;
import java.util.Collections;
import org.apache.cordova.CordovaPreferences;

/** A private Capacitor host without application-global core-plugin side effects. */
final class WorkersNativeBridge extends Bridge {
    private WorkersNativeBridge(AppCompatActivity activity, WebView view,
            MockCordovaInterfaceImpl cordova, MockCordovaWebViewImpl cordovaView,
            CordovaPreferences preferences, CapConfig config) {
        super(activity, view, Collections.singletonList(WorkersCapacitorPlugin.class),
            cordova, cordovaView.getPluginManager(), preferences, config);
        setCordovaWebView(cordovaView);
    }

    @Override public void registerPlugin(Class<? extends Plugin> plugin) {
        // Bridge invokes this virtual method during its constructor. In particular,
        // CapacitorCookies.load/destroy clears session cookies and replaces the
        // process CookieHandler even when its configuration says disabled.
        // The SDK uses WorkersCapacitor's scoped cookies and sockets instead.
        if (plugin == WorkersCapacitorPlugin.class) super.registerPlugin(plugin);
    }

    static WorkersNativeBridge create(AppCompatActivity activity, WebView view,
            CapConfig config, String assets) {
        CordovaPreferences preferences = new CordovaPreferences();
        // Skip Capacitor's shared deployment/version preferences: the SDK's
        // packaged assets must not reset an existing Capacitor host's server path.
        preferences.set("DisableDeploy", true);
        MockCordovaInterfaceImpl cordova = new MockCordovaInterfaceImpl(activity);
        MockCordovaWebViewImpl cordovaView = new MockCordovaWebViewImpl(activity.getApplicationContext());
        cordovaView.init(cordova, Collections.emptyList(), preferences, view);
        cordova.onCordovaInit(cordovaView.getPluginManager());
        WorkersNativeBridge bridge = new WorkersNativeBridge(activity, view, cordova, cordovaView, preferences, config);
        bridge.setServerAssetPath(assets);
        return bridge;
    }
}
