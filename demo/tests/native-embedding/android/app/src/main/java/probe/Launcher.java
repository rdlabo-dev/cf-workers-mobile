package probe;

import android.os.Bundle;
import android.webkit.CookieManager;
import android.util.Log;
import java.net.CookieHandler;
import java.net.CookiePolicy;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import jp.rdlabo.workerscapacitor.WorkersNative;

/** Existing native screen: the only SDK call is WorkersNative.open. */
public final class Launcher extends androidx.activity.ComponentActivity {
    private int visits;
    private static final String HOST_URL = "https://native-host.example/";
    private static CookieHandler hostHandler;
    private android.webkit.WebView hostWebView;
    private TextView swStatus;
    private volatile String swPhase = "before SDK open";
    private boolean recreateNextWorker;
    private final android.app.Application.ActivityLifecycleCallbacks recreationProbe = new android.app.Application.ActivityLifecycleCallbacks() {
        @Override public void onActivityResumed(android.app.Activity activity) {
            if (recreateNextWorker && activity.getClass().getName().endsWith("WorkersNativeActivity")) {
                recreateNextWorker = false;
                new android.os.Handler(getMainLooper()).postDelayed(() -> {
                    Log.i("HostIsolation", "Recreating SDK Activity");
                    activity.recreate();
                }, 1500);
            }
        }
        @Override public void onActivityCreated(android.app.Activity a, Bundle b) {
            if (a.getClass().getName().endsWith("WorkersNativeActivity")) Log.i("HostIsolation", "SDK Activity created " + System.identityHashCode(a));
        }
        @Override public void onActivityStarted(android.app.Activity a) {}
        @Override public void onActivityPaused(android.app.Activity a) {}
        @Override public void onActivityStopped(android.app.Activity a) {}
        @Override public void onActivitySaveInstanceState(android.app.Activity a, Bundle b) {}
        @Override public void onActivityDestroyed(android.app.Activity a) {
            if (a.getClass().getName().endsWith("WorkersNativeActivity")) Log.i("HostIsolation", "SDK Activity destroyed " + System.identityHashCode(a));
        }
    };

    private android.webkit.WebResourceResponse hostResource(android.webkit.WebResourceRequest request) {
        if (!"native-host.example".equals(request.getUrl().getHost())) return null;
        String route = request.getUrl().getPath();
        String body;
        String mime = "text/javascript";
        if ("/sw.js".equals(route)) {
            body = "self.addEventListener('install',e=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(clients.claim()));self.addEventListener('message',e=>e.waitUntil(fetch('/sentinel?t='+Date.now()).then(r=>r.text()).then(value=>e.source.postMessage(value))));";
        } else if ("/sentinel".equals(route)) {
            Log.i("HostIsolation", "Host ServiceWorkerClient fetched sentinel");
            body = "host-sw-retained";
            mime = "text/plain";
        } else {
            mime = "text/html";
            body = "<script>navigator.serviceWorker.onmessage=e=>HostProbe.result(e.data);navigator.serviceWorker.register('/sw.js').then(()=>navigator.serviceWorker.ready).then(r=>r.active.postMessage('probe')).catch(e=>HostProbe.result(String(e)));</script>";
        }
        return new android.webkit.WebResourceResponse(mime, "UTF-8", new java.io.ByteArrayInputStream(body.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    }

    private static String hostState(String phase) {
        String cookies = CookieManager.getInstance().getCookie(HOST_URL);
        boolean session = cookies != null && cookies.contains("host_session=retained");
        boolean persistent = cookies != null && cookies.contains("host_persistent=retained");
        boolean handler = CookieHandler.getDefault() == hostHandler;
        String result = "Host isolation session=" + session + " persistent=" + persistent + " handler=" + handler;
        Log.i("HostIsolation", phase + ": " + result);
        return result;
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        visits = state == null ? 0 : state.getInt("visits");
        if (hostHandler == null) {
            hostHandler = new java.net.CookieManager(null, CookiePolicy.ACCEPT_ALL);
            CookieHandler.setDefault(hostHandler);
            CookieManager cookies = CookieManager.getInstance();
            cookies.setCookie(HOST_URL, "host_session=retained; Path=/; Secure");
            cookies.setCookie(HOST_URL, "host_persistent=retained; Path=/; Secure; Max-Age=86400");
            cookies.flush();
            hostState("before SDK open");
        }
        getApplication().registerActivityLifecycleCallbacks(recreationProbe);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        TextView status = new TextView(this);
        status.setText("Native host visits " + visits);
        layout.addView(status);
        for (String scenario : new String[] {"normal", "failure", "broken", "recreate"}) {
            Button open = new Button(this);
            open.setText(switch (scenario) {
                case "normal" -> "Open Worker";
                case "failure" -> "Open failed Worker";
                case "broken" -> "Open broken Worker";
                default -> "Recreate Worker";
            });
            open.setAllCaps(false);
            open.setOnClickListener(view -> {
                status.setText("Native host visits " + ++visits);
                recreateNextWorker = scenario.equals("recreate");
                WorkersNative.open(this, switch (scenario) {
                    case "failure" -> "sdk-web-failure";
                    case "broken" -> "sdk-web-broken";
                    default -> "sdk-web";
                });
                new android.os.Handler(getMainLooper()).postDelayed(() -> {
                    hostState("SDK open");
                    swPhase = "during SDK open";
                    hostWebView.evaluateJavascript("navigator.serviceWorker.ready.then(r=>r.active.postMessage('probe'))", null);
                }, 1000);
            });
            layout.addView(open);
        }
        TextView isolation = new TextView(this);
        layout.addView(isolation);
        Button inspect = new Button(this);
        inspect.setText("Verify host isolation");
        inspect.setAllCaps(false);
        inspect.setOnClickListener(view -> isolation.setText(hostState("after SDK close")));
        layout.addView(inspect);
        swStatus = new TextView(this);
        layout.addView(swStatus);
        Button swProbe = new Button(this);
        swProbe.setText("Verify host service worker");
        swProbe.setAllCaps(false);
        swProbe.setOnClickListener(view -> {
            swPhase = "after SDK close";
            swStatus.setText("Host service worker pending");
            hostWebView.evaluateJavascript("navigator.serviceWorker.ready.then(r=>r.active.postMessage('probe'))", null);
        });
        layout.addView(swProbe);
        hostWebView = new android.webkit.WebView(this);
        hostWebView.getSettings().setJavaScriptEnabled(true);
        hostWebView.addJavascriptInterface(new Object() {
            @android.webkit.JavascriptInterface public void result(String value) {
                Log.i("HostIsolation", "Host SW result " + swPhase + ": " + value);
                runOnUiThread(() -> swStatus.setText("Host service worker " + value));
            }
        }, "HostProbe");
        hostWebView.setWebViewClient(new android.webkit.WebViewClient() {
            @Override public android.webkit.WebResourceResponse shouldInterceptRequest(android.webkit.WebView view, android.webkit.WebResourceRequest request) {
                return hostResource(request);
            }
        });
        android.webkit.ServiceWorkerController.getInstance().setServiceWorkerClient(new android.webkit.ServiceWorkerClient() {
            @Override public android.webkit.WebResourceResponse shouldInterceptRequest(android.webkit.WebResourceRequest request) {
                return hostResource(request);
            }
        });
        layout.addView(hostWebView, new LinearLayout.LayoutParams(1, 1));
        setContentView(layout);
        hostWebView.loadUrl(HOST_URL);
    }
    @Override protected void onDestroy() {
        getApplication().unregisterActivityLifecycleCallbacks(recreationProbe);
        if (hostWebView != null) hostWebView.destroy();
        super.onDestroy();
    }
    @Override public void onSaveInstanceState(Bundle state) {
        state.putInt("visits", visits);
        super.onSaveInstanceState(state);
    }
}
