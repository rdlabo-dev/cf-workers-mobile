package jp.rdlabo.workerscapacitor;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.*;
import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.Profile;
import androidx.webkit.ProfileStore;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.*;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** SDK-owned screen with a persistent browsing profile isolated from host WebViews. */
public final class WorkersNativeActivity extends AppCompatActivity {
    // Keep the SDK profile across openings: its cookies belong to the SDK session.
    // Never change the default profile's cookies, CookieHandler or SW controller.
    private static final String PROFILE_NAME = "jp.rdlabo.workerscapacitor.native.v1";
    private static WorkersNativeActivity active;
    private static final class RuntimeWebView extends WebView {
        private boolean enabled;
        private String pendingUrl;
        RuntimeWebView(android.content.Context context) { super(context); }
        @Override public void loadUrl(String url) {
            if (!enabled) { pendingUrl = url; return; }
            super.loadUrl(url);
        }
        void start() {
            enabled = true;
            if (pendingUrl != null) { String url = pendingUrl; pendingUrl = null; super.loadUrl(url); }
        }
        void discardInitialNavigation() { pendingUrl = null; }
    }
    private final Handler main = new Handler(Looper.getMainLooper());
    private final List<Runnable> released = new ArrayList<>();
    private volatile Bridge bridge;
    private Profile profile;
    private WebView ownedView;
    private String session;
    private boolean closing;
    private boolean activated;
    private boolean destroyed;
    private boolean didRelease;
    private final Runnable startupDeadline = () -> {
        android.util.Log.e("WorkersNative", "Runtime startup timed out before ready");
        finish();
    };

    @Override public void onCreate(Bundle state) {
        setTheme(androidx.appcompat.R.style.Theme_AppCompat_Light_NoActionBar);
        super.onCreate(state);
        session = state == null ? UUID.randomUUID().toString() : state.getString("workersSession");
        if (active != null) {
            WorkersNativeActivity previous = active;
            if (state == null || session == null || !session.equals(previous.session)) {
                super.finish();
                return;
            }
            // Activity.recreate creates a replacement before asynchronous runtime
            // disposal necessarily finishes. Acquire ownership only after release.
            // BridgeWebChromeClient must register ActivityResult launchers before
            // STARTED. Prepare the new bridge now, but execute no JS until the
            // previous runtime has fully released the shared SDK profile.
            if (!prepare()) return;
            previous.released.add(() -> {
                if (!destroyed && !closing) { active = this; activate(); }
            });
            previous.shutdown(false);
            return;
        }
        active = this;
        if (prepare()) activate();
    }

    private boolean prepare() {
        try {
            if (!WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE))
                throw new IllegalStateException("Workers Native requires a WebView with MULTI_PROFILE support");
            String assets = getIntent().getStringExtra("workersAssetPath");
            if (assets == null) throw new IllegalArgumentException("Missing runtime asset directory");
            try (java.io.InputStream ignored = getAssets().open(assets + "/index.html")) {}
            profile = ProfileStore.getInstance().getOrCreateProfile(PROFILE_NAME);
            RuntimeWebView view = new RuntimeWebView(this);
            ownedView = view;
            WebViewCompat.setProfile(view, PROFILE_NAME);
            view.setId(com.getcapacitor.android.R.id.webview);
            setContentView(view);
            Object nativeHost = new Object() {
                @JavascriptInterface public void failed(String message) {
                    main.post(() -> { android.util.Log.e("WorkersNative", message); finish(); });
                }
                @JavascriptInterface public void ready() {
                    main.post(() -> { if (!closing) main.removeCallbacks(startupDeadline); });
                }
            };
            view.addJavascriptInterface(nativeHost, "WorkersNativeHost");
            bridge = WorkersNativeBridge.create(this, view,
                new CapConfig.Builder(this).setHostname("workers-sdk.local")
                    .setResolveServiceWorkerRequests(false).create(), assets);
            bridge.addWebViewListener(new WebViewListener() {
                @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                    if (bridge != null) plugin().rendererGone();
                    return true;
                }
            });
            WorkersCapacitorPlugin plugin = plugin();
            plugin.setNativeHost(nativeHost);
            plugin.setNativeProfile(profile);
            plugin.setNativeFailure(this::finish);
            // Drop the constructor's synchronous default-assets navigation. The
            // final asset-path navigation is posted and remains gated until activate.
            view.discardInitialNavigation();
            return true;
        } catch (Exception error) {
            android.util.Log.e("WorkersNative", "Runtime startup failed", error);
            finish();
            return false;
        }
    }

    private void activate() {
        try {
            main.postDelayed(startupDeadline, 30000);
            profile.getServiceWorkerController().setServiceWorkerClient(new ServiceWorkerClient() {
                @Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                    Bridge current = bridge;
                    if (current == null) return null;
                    android.net.Uri local = android.net.Uri.parse(current.getLocalUrl());
                    if (!local.getScheme().equals(request.getUrl().getScheme()) || !local.getAuthority().equals(request.getUrl().getAuthority())) return null;
                    return current.getLocalServer().shouldInterceptRequest(request);
                }
            });
            activated = true;
            ((RuntimeWebView) ownedView).start();
            if (getLifecycle().getCurrentState().isAtLeast(androidx.lifecycle.Lifecycle.State.STARTED)) bridge.onStart();
            if (getLifecycle().getCurrentState().isAtLeast(androidx.lifecycle.Lifecycle.State.RESUMED)) bridge.onResume();
        } catch (Exception error) {
            android.util.Log.e("WorkersNative", "Runtime startup failed", error);
            finish();
        }
    }

    private WorkersCapacitorPlugin plugin() {
        return (WorkersCapacitorPlugin) bridge.getPlugin("WorkersCapacitor").getInstance();
    }
    @Override public void finish() { shutdown(true); }
    private void shutdown(boolean finishScreen) {
        main.removeCallbacks(startupDeadline);
        if (closing) return;
        closing = true;
        Runnable done = () -> { release(); if (finishScreen) WorkersNativeActivity.super.finish(); };
        if (bridge == null) done.run(); else plugin().closeRuntime(done);
    }
    private void release() {
        if (didRelease) return;
        didRelease = true;
        if (bridge != null) { bridge.onDestroy(); bridge = null; }
        if (ownedView != null) { ownedView.destroy(); ownedView = null; }
        if (profile != null && active == this) profile.getServiceWorkerController().setServiceWorkerClient(null);
        profile = null;
        if (active == this) active = null;
        for (Runnable callback : new ArrayList<>(released)) callback.run();
        released.clear();
    }
    @Override public void onSaveInstanceState(Bundle state) {
        state.putString("workersSession", session);
        super.onSaveInstanceState(state);
    }
    @Override public void onConfigurationChanged(android.content.res.Configuration config) { super.onConfigurationChanged(config); if (bridge != null) bridge.onConfigurationChanged(config); }
    @Override protected void onStart() { super.onStart(); if (bridge != null && activated) bridge.onStart(); }
    @Override protected void onResume() { super.onResume(); if (bridge != null && activated) bridge.onResume(); }
    @Override protected void onPause() { if (bridge != null && activated) bridge.onPause(); super.onPause(); }
    @Override protected void onStop() { if (bridge != null && activated) bridge.onStop(); super.onStop(); }
    @Override protected void onDestroy() { destroyed = true; shutdown(false); super.onDestroy(); }
}
