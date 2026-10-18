package jp.rdlabo.workerscapacitor.poc;

import android.webkit.*;
import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.Plugin;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;

/** Test-only automatically discovered plugin; MainActivity is unchanged. */
@CapacitorPlugin(name = "DocumentConnection")
public class DocumentConnectionPlugin extends Plugin {
    private WebView runtime;
    @Override public void load() {
        new Handler(Looper.getMainLooper()).post(() -> {
            runtime = new WebView(getContext());
            runtime.getSettings().setJavaScriptEnabled(true);
            runtime.getSettings().setDomStorageEnabled(true);
            runtime.setWebViewClient(new WebViewClient() {
                @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    return bridge.getLocalServer().shouldInterceptRequest(request);
                }
            });
            bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
                @Override public void onPageFinished(WebView view, String url) {
                    super.onPageFinished(view, url);
                    try (java.io.InputStream stream = getContext().getAssets().open("public/probe.js")) {
                        view.evaluateJavascript(new String(stream.readAllBytes(), StandardCharsets.UTF_8), null);
                    } catch (Exception error) { android.util.Log.e("NativeDocuments", "Probe", error); }
                }
            });
            runtime.loadUrl("https://localhost/runtime.html");
        });
    }
    @Override protected void handleOnDestroy() {
        if (runtime != null) runtime.destroy();
    }
}
