package jp.rdlabo.workerscapacitor;

import android.os.Bundle;
import android.webkit.*;
import androidx.appcompat.app.AppCompatActivity;
import com.getcapacitor.*;

/** SDK-owned screen; one active runtime per process. Hosts must not install a custom service-worker client. */
public final class WorkersNativeActivity extends AppCompatActivity {
    private static WorkersNativeActivity active;
    private volatile Bridge bridge;
    private WebView ownedView;
    private boolean closing;
    @Override public void onCreate(Bundle state) {
        setTheme(androidx.appcompat.R.style.Theme_AppCompat_Light_NoActionBar);
        super.onCreate(state);
        if (active != null) { super.finish(); return; }
        active = this;
        try {
            WebView view = new WebView(this);
            ownedView = view;
            view.setId(com.getcapacitor.android.R.id.webview);
            setContentView(view);
            Object nativeHost = new Object() {
                @JavascriptInterface public void failed(String message) {
                    runOnUiThread(() -> { android.util.Log.e("WorkersNative", message); finish(); });
                }
            };
            view.addJavascriptInterface(nativeHost, "WorkersNativeHost");
            String assets = getIntent().getStringExtra("workersAssetPath");
            if (assets == null) throw new IllegalArgumentException("Missing runtime asset directory");
            try (java.io.InputStream ignored = getAssets().open(assets + "/index.html")) {}
            bridge = new Bridge.Builder(this).setInstanceState(state)
                .setConfig(new CapConfig.Builder(this).setHostname("workers-sdk.local")
                    .setResolveServiceWorkerRequests(false).create())
                .setServerPath(new ServerPath(ServerPath.PathType.ASSET_PATH, assets))
                .addPlugin(WorkersCapacitorPlugin.class)
                .addWebViewListener(new WebViewListener() {
                    @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                        if (bridge != null) ((WorkersCapacitorPlugin) bridge.getPlugin("WorkersCapacitor").getInstance()).rendererGone();
                        return true;
                    }
                }).create();
            WorkersCapacitorPlugin plugin = (WorkersCapacitorPlugin) bridge.getPlugin("WorkersCapacitor").getInstance();
            plugin.setNativeHost(nativeHost);
            plugin.setNativeFailure(this::finish);
            ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient() {
                @Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                    Bridge current = bridge;
                    if (current == null) return null;
                    android.net.Uri local = android.net.Uri.parse(current.getLocalUrl());
                    if (!local.getScheme().equals(request.getUrl().getScheme()) || !local.getAuthority().equals(request.getUrl().getAuthority())) return null;
                    return current.getLocalServer().shouldInterceptRequest(request);
                }
            });
        } catch (Exception error) {
            android.util.Log.e("WorkersNative", "Runtime startup failed", error);
            finish();
        }
    }
    @Override public void finish() {
        if (closing) return;
        closing = true;
        if (bridge == null) { release(); super.finish(); return; }
        WorkersCapacitorPlugin plugin = (WorkersCapacitorPlugin) bridge.getPlugin("WorkersCapacitor").getInstance();
        plugin.closeRuntime(() -> { release(); WorkersNativeActivity.super.finish(); });
    }
    private void release() {
        if (bridge != null) {
            bridge.onDestroy();
            bridge = null;
        }
        if (ownedView != null) {
            ownedView.destroy();
            ownedView = null;
        }
        if (active == this) {
            ServiceWorkerController.getInstance().setServiceWorkerClient(null);
            active = null;
        }
    }
    @Override public void onConfigurationChanged(android.content.res.Configuration config) { super.onConfigurationChanged(config); if (bridge != null) bridge.onConfigurationChanged(config); }
    @Override protected void onStart() { super.onStart(); if (bridge != null) bridge.onStart(); }
    @Override protected void onResume() { super.onResume(); if (bridge != null) bridge.onResume(); }
    @Override protected void onPause() { if (bridge != null) bridge.onPause(); super.onPause(); }
    @Override protected void onStop() { if (bridge != null) bridge.onStop(); super.onStop(); }
    @Override protected void onDestroy() {
        if (bridge != null) {
            WorkersCapacitorPlugin plugin = (WorkersCapacitorPlugin) bridge.getPlugin("WorkersCapacitor").getInstance();
            plugin.closeRuntime(this::release);
        } else release();
        super.onDestroy();
    }
}
