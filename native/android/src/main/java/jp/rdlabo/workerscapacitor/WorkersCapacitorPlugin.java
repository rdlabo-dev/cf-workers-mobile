package jp.rdlabo.workerscapacitor;

import android.os.Handler;
import android.os.Looper;
import android.webkit.*;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.net.URI;
import org.json.JSONObject;
import org.json.JSONArray;

/** Internal runtime host. The application keeps its ordinary BridgeActivity. */
@CapacitorPlugin(name = "WorkersCapacitor")
public class WorkersCapacitorPlugin extends Plugin {
    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile WorkerSockets network = new WorkerSockets();
    private WebView runtime;
    private HostBridge hostBridge;
    private PluginCall starting;
    private Runnable timeout;

    private final WebViewListener networkLifecycle = new WebViewListener() {
        @Override public void onPageStarted(WebView webView) {
            bridge.execute(() -> {
                WorkerSockets previous = network;
                network = new WorkerSockets();
                previous.shutdown();
            });
        }
    };
    @Override public void load() {
        // Bridge.Builder assigns its listener list after loading plugins.
        // Register on the next UI turn so that assignment cannot discard us.
        main.post(() -> bridge.addWebViewListener(networkLifecycle));
    }

    @PluginMethod public void start(PluginCall call) {
        main.post(() -> {
            if (runtime != null) { call.reject("Document rendering already started"); return; }
            String bootstrap = call.getString("bootstrapURL");
            try {
                URI url = new URI(bootstrap);
                URI local = new URI(bridge.getLocalUrl());
                if (!url.getScheme().equals(local.getScheme()) || !url.getAuthority().equals(local.getAuthority()) || !url.getPath().equals("/index.html")) throw new IllegalArgumentException();
            } catch (Exception error) { call.reject("Invalid document bootstrap URL"); return; }
            starting = call;
            runtime = new WebView(getContext());
            runtime.getSettings().setJavaScriptEnabled(true);
            runtime.getSettings().setDomStorageEnabled(true);
            hostBridge = new HostBridge(runtime);
            runtime.addJavascriptInterface(hostBridge, "WorkersCapacitorHost");
            runtime.setWebViewClient(new WebViewClient() {
                @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    return bridge.getLocalServer().shouldInterceptRequest(request);
                }
                @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    return !request.getUrl().toString().equals(bootstrap);
                }
            });
            timeout = () -> { if (starting != null) { starting.reject("Document host startup timed out"); starting = null; close(); } };
            main.postDelayed(timeout, 30000);
            runtime.loadUrl(bootstrap);
        });
    }
    @PluginMethod public void stop(PluginCall call) { main.post(() -> { close(); call.resolve(); }); }

    // ---- Outbound network transport (see src/compat/fetch/transport.ts) ----

    private WorkerSockets.Result result(PluginCall call) {
        WorkerSockets owner = network;
        return new WorkerSockets.Result() {
            @Override public void resolve(JSObject value) {
                bridge.execute(() -> {
                    if (owner != network) return;
                    if (value != null) call.resolve(value); else call.resolve();
                });
            }
            @Override public void reject(String message) {
                bridge.execute(() -> {
                    if (owner == network) call.reject(message);
                });
            }
        };
    }

    @PluginMethod public void socketWatch(PluginCall call) { network.watch(call.getString("id"),result(call)); }
    @PluginMethod public void socketOpen(PluginCall call) {
        network.open(call.getString("id"),call.getString("host"),call.getInt("port",0),call.getBoolean("tls",false),result(call));
    }
    @PluginMethod public void socketWrite(PluginCall call) { network.write(call.getString("id"),call.getString("chunk"),result(call)); }
    @PluginMethod public void socketEnd(PluginCall call) { network.end(call.getString("id"),result(call)); }
    @PluginMethod public void socketRead(PluginCall call) { network.read(call.getString("id"),call.getInt("maxBytes",65536),result(call)); }
    @PluginMethod public void socketClose(PluginCall call) { network.close(call.getString("id"),result(call)); }

    @PluginMethod public void cookiesGet(PluginCall call) { cookiesGet(call.getString("url"), result(call)); }
    @PluginMethod public void cookiesSet(PluginCall call) {
        JSArray values = call.getArray("cookies");
        if (values == null) { call.reject("Invalid remote cookies"); return; }
        cookiesSet(call.getString("url"), values.toString(), result(call));
    }
    private boolean cookieURL(String value) {
        try { URI url = new URI(value); return "https".equals(url.getScheme()) && url.getHost() != null && url.getUserInfo() == null; }
        catch (Exception error) { return false; }
    }
    private void cookiesGet(String url, WorkerSockets.Result result) {
        if (!cookieURL(url)) { result.reject("Cookies require an HTTPS URL without credentials"); return; }
        main.post(() -> {
            String cookie = CookieManager.getInstance().getCookie(url);
            JSObject value = new JSObject(); value.put("cookie", cookie == null ? "" : cookie); result.resolve(value);
        });
    }
    private void cookiesSet(String url, String values, WorkerSockets.Result result) {
        if (!cookieURL(url)) { result.reject("Cookies require an HTTPS URL without credentials"); return; }
        try {
            JSONArray cookies = new JSONArray(values);
            main.post(() -> saveCookie(url, cookies, 0, result));
        } catch (Exception error) { result.reject("Invalid remote cookies"); }
    }
    private void saveCookie(String url, JSONArray cookies, int index, WorkerSockets.Result result) {
        CookieManager store = CookieManager.getInstance();
        if (index == cookies.length()) { store.flush(); result.resolve(null); return; }
        store.setCookie(url, cookies.optString(index), accepted -> saveCookie(url, cookies, index + 1, result));
    }

    private void close() {
        if (hostBridge != null) { hostBridge.network.shutdown(); hostBridge = null; }
        if (timeout != null) main.removeCallbacks(timeout);
        if (starting != null) { starting.reject("Document runtime disposed"); starting = null; }
        if (runtime != null) {
            runtime.stopLoading(); runtime.removeJavascriptInterface("WorkersCapacitorHost"); runtime.destroy(); runtime = null;
        }
    }
    @Override protected void handleOnDestroy() { bridge.removeWebViewListener(networkLifecycle); main.post(this::close); network.shutdown(); }

    /**
     * JavaScript interface exposed to the hidden document runtime. The bridge
     * is synchronous, so network results are delivered back into the WebView
     * via WorkersCapacitorHostCallback.deliver(callbackId, success, json).
     */
    private void deliverToHost(WebView owner, String callbackId, boolean success, String resultJson) {
        main.post(() -> {
            WebView view = runtime;
            if (view == null || view != owner) return;
            view.evaluateJavascript(
                "WorkersCapacitorHostCallback.deliver(" + JSONObject.quote(callbackId)
                    + "," + success + "," + (resultJson == null ? "null" : resultJson) + ")",
                null
            );
        });
    }
    private WorkerSockets.Result hostResult(WebView owner, String callbackId) {
        return new WorkerSockets.Result() {
            @Override public void resolve(JSObject value) {
                deliverToHost(owner, callbackId, true, value == null ? "null" : value.toString());
            }
            @Override public void reject(String message) {
                JSObject error = new JSObject();
                error.put("message", message);
                deliverToHost(owner, callbackId, false, error.toString());
            }
        };
    }
    private class HostBridge {
        private final WebView owner;
        private final WorkerSockets network = new WorkerSockets();
        HostBridge(WebView owner) { this.owner = owner; }
        @JavascriptInterface public void ready() {
            main.post(() -> {
                if (runtime == owner && starting != null) { main.removeCallbacks(timeout); starting.resolve(); starting = null; }
            });
        }
        @JavascriptInterface public void cookiesGet(String callbackId,String url) { WorkersCapacitorPlugin.this.cookiesGet(url,hostResult(owner,callbackId)); }
        @JavascriptInterface public void cookiesSet(String callbackId,String url,String cookies) { WorkersCapacitorPlugin.this.cookiesSet(url,cookies,hostResult(owner,callbackId)); }
        @JavascriptInterface public void socketWatch(String callbackId,String id) { network.watch(id,hostResult(owner,callbackId)); }
        @JavascriptInterface public void socketOpen(String callbackId,String id,String host,int port,boolean tls) { network.open(id,host,port,tls,hostResult(owner,callbackId)); }
        @JavascriptInterface public void socketWrite(String callbackId,String id,String chunk) { network.write(id,chunk,hostResult(owner,callbackId)); }
        @JavascriptInterface public void socketEnd(String callbackId,String id) { network.end(id,hostResult(owner,callbackId)); }
        @JavascriptInterface public void socketRead(String callbackId,String id,int count) { network.read(id,count,hostResult(owner,callbackId)); }
        @JavascriptInterface public void socketClose(String callbackId,String id) { network.close(id,hostResult(owner,callbackId)); }
    }
}
