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
    private androidx.webkit.ScriptHandler documentLinks;
    private HostBridge hostBridge;
    private PluginCall starting;
    private Runnable timeout;
    private final java.util.List<Runnable> closeCallbacks = new java.util.ArrayList<>();
    private boolean closingRuntime;
    private Runnable closeTimeout;
    private Object closeGeneration;
    private Object sdkHost;
    private androidx.webkit.Profile sdkProfile;
    void setNativeProfile(androidx.webkit.Profile profile) { sdkProfile = profile; }
    private CookieManager cookies() { return sdkProfile == null ? CookieManager.getInstance() : sdkProfile.getCookieManager(); }
    private boolean awaitingNativeCleanup;
    private boolean rendererLost;
    private Runnable nativeFailure;
    void setNativeFailure(Runnable failure) { nativeFailure = failure; }
    void rendererGone() { rendererLost = true; if (nativeFailure != null) nativeFailure.run(); }
    void setNativeHost(Object host) { sdkHost = host; }

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
            if (closingRuntime || runtime != null) { call.reject("Document rendering already started"); return; }
            String bootstrap = call.getString("bootstrapURL");
            try {
                URI url = new URI(bootstrap);
                URI local = new URI(bridge.getLocalUrl());
                if (!url.getScheme().equals(local.getScheme()) || !url.getAuthority().equals(local.getAuthority()) || !url.getPath().equals("/index.html")) throw new IllegalArgumentException();
            } catch (Exception error) { call.reject("Invalid document bootstrap URL"); return; }
            if (!androidx.webkit.WebViewFeature.isFeatureSupported(androidx.webkit.WebViewFeature.DOCUMENT_START_SCRIPT)) {
                call.reject("Document navigation requires a WebView with document-start script support"); return;
            }
            String script = "globalThis.__workersCapacitorDocuments = {baseURL:" + JSONObject.quote(call.getString("baseURL")) + "};\n" + call.getString("linksScript");
            documentLinks = androidx.webkit.WebViewCompat.addDocumentStartJavaScript(bridge.getWebView(), script, java.util.Collections.singleton(bridge.getLocalUrl().replaceAll("/$", "")));
            starting = call;
            runtime = new WebView(getContext());
            if (sdkProfile != null) androidx.webkit.WebViewCompat.setProfile(runtime, sdkProfile.getName());
            runtime.getSettings().setJavaScriptEnabled(true);
            runtime.getSettings().setDomStorageEnabled(true);
            hostBridge = new HostBridge(runtime);
            runtime.addJavascriptInterface(hostBridge, "WorkersCapacitorHost");
            if (sdkHost != null) runtime.addJavascriptInterface(sdkHost, "WorkersNativeHost");
            runtime.setWebViewClient(new WebViewClient() {
                @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                    if (sdkHost == null) return false;
                    main.post(WorkersCapacitorPlugin.this::rendererGone);
                    return true;
                }
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
    @PluginMethod public void stop(PluginCall call) { main.post(() -> { if (closingRuntime) call.resolve(); else { close(); call.resolve(); } }); }

    // ---- Outbound network transport (see src/browser/fetch/transport.ts) ----

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

    @PluginMethod public void socketStartTls(PluginCall call) { network.startTls(call.getString("id"),call.getString("servername"),result(call)); }
    @PluginMethod public void socketWatch(PluginCall call) { network.watch(call.getString("id"),result(call)); }
    @PluginMethod public void socketOpen(PluginCall call) {
        network.open(call.getString("id"),call.getString("host"),call.getInt("port",0),call.getBoolean("tls",false),call.getString("servername"),result(call));
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
            String cookie = cookies().getCookie(url);
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
        CookieManager store = cookies();
        if (index == cookies.length()) { store.flush(); result.resolve(null); return; }
        store.setCookie(url, cookies.optString(index), accepted -> saveCookie(url, cookies, index + 1, result));
    }

    private void close() { closingRuntime = true; finishClose(); }
    void closeRuntime(Runnable completion) {
        if (Looper.myLooper() != Looper.getMainLooper()) { main.post(() -> closeRuntime(completion)); return; }
        closeCallbacks.add(completion);
        if (closingRuntime) return;
        closingRuntime = true;
        if (rendererLost) { finishClose(); return; }
        WebView closingView = runtime != null ? runtime : bridge.getWebView();
        Object generation = new Object();
        closeGeneration = generation;
        closeTimeout = () -> { if (closeGeneration == generation) finishClose(); };
        main.postDelayed(closeTimeout, 5000);
        if (runtime != null) {
            closingView.evaluateJavascript("Promise.resolve().then(() => globalThis.__workersNativeDispose?.()).then(() => WorkersCapacitorHost.disposed(), () => WorkersCapacitorHost.disposed())", null);
        } else {
            String token = "__workersClosing" + System.nanoTime();
            closingView.evaluateJavascript("globalThis." + token + "=false;Promise.resolve().then(() => globalThis.__workersNativeDispose?.()).finally(() => globalThis." + token + "=true)", null);
            pollDisposal(closingView, token, generation);
        }
    }
    private void pollDisposal(WebView owner, String token, Object generation) {
        if (!closingRuntime || closeGeneration != generation) return;
        owner.evaluateJavascript("globalThis." + token + "===true", value -> {
            if (!closingRuntime || closeGeneration != generation) return;
            if ("true".equals(value)) finishClose();
            else main.postDelayed(() -> pollDisposal(owner, token, generation), 25);
        });
    }

    private void finishClose() {
        if (!closingRuntime || awaitingNativeCleanup) return;
        if (closeTimeout != null) main.removeCallbacks(closeTimeout);
        if (documentLinks != null) { documentLinks.remove(); documentLinks = null; }
        java.util.concurrent.CompletableFuture<Void> hiddenShutdown = hostBridge == null
            ? java.util.concurrent.CompletableFuture.completedFuture(null) : hostBridge.network.shutdown().toCompletableFuture();
        hostBridge = null;
        if (timeout != null) main.removeCallbacks(timeout);
        if (starting != null) { starting.reject("Document runtime disposed"); starting = null; }
        if (runtime != null) {
            runtime.stopLoading(); runtime.removeJavascriptInterface("WorkersCapacitorHost"); runtime.destroy(); runtime = null;
        }
        if (!closeCallbacks.isEmpty()) {
            awaitingNativeCleanup = true;
            java.util.concurrent.CompletableFuture.allOf(hiddenShutdown, network.shutdown().toCompletableFuture())
                .whenComplete((unused, error) -> main.post(this::completeClose));
        } else completeClose();
    }
    private void completeClose() {
        awaitingNativeCleanup = false;
        closeGeneration = null;
        closingRuntime = false;
        java.util.List<Runnable> callbacks = new java.util.ArrayList<>(closeCallbacks);
        closeCallbacks.clear();
        for (Runnable callback : callbacks) callback.run();
    }
    @Override protected void handleOnDestroy() { bridge.removeWebViewListener(networkLifecycle); close(); network.shutdown(); }

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
        @JavascriptInterface public void disposed() { main.post(() -> { if (runtime == owner) finishClose(); }); }
        @JavascriptInterface public void ready() {
            main.post(() -> {
                if (runtime == owner && starting != null) { main.removeCallbacks(timeout); starting.resolve(); starting = null; }
            });
        }
        @JavascriptInterface public void cookiesGet(String callbackId,String url) { WorkersCapacitorPlugin.this.cookiesGet(url,hostResult(owner,callbackId)); }
        @JavascriptInterface public void cookiesSet(String callbackId,String url,String cookies) { WorkersCapacitorPlugin.this.cookiesSet(url,cookies,hostResult(owner,callbackId)); }
        @JavascriptInterface public void socketStartTls(String callbackId,String id,String servername) { network.startTls(id,servername,hostResult(owner,callbackId)); }
        @JavascriptInterface public void socketWatch(String callbackId,String id) { network.watch(id,hostResult(owner,callbackId)); }
        @JavascriptInterface public void socketOpen(String callbackId,String id,String host,int port,boolean tls,String servername) { network.open(id,host,port,tls,servername,hostResult(owner,callbackId)); }
        @JavascriptInterface public void socketWrite(String callbackId,String id,String chunk) { network.write(id,chunk,hostResult(owner,callbackId)); }
        @JavascriptInterface public void socketEnd(String callbackId,String id) { network.end(id,hostResult(owner,callbackId)); }
        @JavascriptInterface public void socketRead(String callbackId,String id,int count) { network.read(id,count,hostResult(owner,callbackId)); }
        @JavascriptInterface public void socketClose(String callbackId,String id) { network.close(id,hostResult(owner,callbackId)); }
    }
}
