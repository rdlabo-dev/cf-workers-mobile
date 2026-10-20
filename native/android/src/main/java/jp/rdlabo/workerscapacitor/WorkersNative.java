package jp.rdlabo.workerscapacitor;

import android.content.Context;
import android.content.Intent;

/** Entry point for ordinary Android hosts. Assets contain the packaged web runtime. */
public final class WorkersNative {
    private WorkersNative() {}
    /** Whether this WebView provider can isolate the SDK from host browsing state. */
    public static boolean isSupported() {
        return androidx.webkit.WebViewFeature.isFeatureSupported(androidx.webkit.WebViewFeature.MULTI_PROFILE);
    }
    public static void open(Context context, String assetPath) {
        if (assetPath == null || !assetPath.matches("[A-Za-z0-9_/-]+") || assetPath.contains("..") || assetPath.startsWith("/") || assetPath.contains("//")) {
            throw new IllegalArgumentException("Expected a relative Android asset directory");
        }
        if (!isSupported()) throw new UnsupportedOperationException("Workers Native requires a WebView with MULTI_PROFILE support");
        Intent intent = new Intent(context, WorkersNativeActivity.class).putExtra("workersAssetPath", assetPath);
        if (!(context instanceof android.app.Activity)) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }
}
