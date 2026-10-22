package probe;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.*;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;

/** Debug-only comparator: no Workers runtime, bridge, or Service Worker. */
public final class WebViewControl extends Activity {
    private WebView view;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        WebView.setWebContentsDebuggingEnabled(true);
        view = new WebView(this);
        if (getIntent().getBooleanExtra("profile", false))
            androidx.webkit.WebViewCompat.setProfile(view, "accessibility-control");
        view.getSettings().setJavaScriptEnabled(true);
        view.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView web, WebResourceRequest request) {
                String route = request.getUrl().getPath();
                String title = route.equals("/next") ? "Worker Next" : route.equals("/submit") ? "Posted verified" : "Worker Home";
                String html = "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'><h1>" + title + "</h1><a href='/next'>Next</a><a href='/'>Home</a><form action='/submit' method='post'><button>Submit</button></form>";
                return new WebResourceResponse("text/html", "UTF-8", new ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8)));
            }
        });
        setContentView(view);
        view.loadUrl("https://control.invalid/");
    }
    @Override public void onDestroy() {
        if (view.getParent() instanceof android.view.ViewGroup)
            ((android.view.ViewGroup)view.getParent()).removeView(view);
        view.destroy();
        super.onDestroy();
    }
}
