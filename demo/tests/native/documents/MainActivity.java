package jp.rdlabo.workerscapacitor.poc;

import android.os.Bundle;
import android.webkit.*;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.nio.charset.StandardCharsets;

/** Test-only native request bridge. Never included in the npm library. */
public class MainActivity extends BridgeActivity {
    private WebView runtime;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        runtime = new WebView(this);
        runtime.getSettings().setJavaScriptEnabled(true);
        runtime.getSettings().setDomStorageEnabled(true);
        runtime.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return bridge.getLocalServer().shouldInterceptRequest(request);
            }
        });
        bridge.getWebView().setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                try (java.io.InputStream stream = getAssets().open("public/probe.js")) {
                    view.evaluateJavascript(new String(stream.readAllBytes(), StandardCharsets.UTF_8), null);
                } catch (Exception error) { android.util.Log.e("NativeDocuments", "Probe", error); }
            }
        });
        runtime.loadUrl("https://localhost/runtime.html");
    }

    @Override public void onDestroy() {
        if (runtime != null) runtime.destroy();
        super.onDestroy();
    }
}
