package jp.rdlabo.workerscapacitor;

import android.content.Context;
import android.content.Intent;

/** Entry point for ordinary Android hosts. Assets contain the packaged web runtime. */
public final class WorkersNative {
    private WorkersNative() {}
    public static void open(Context context, String assetPath) {
        if (assetPath == null || !assetPath.matches("[A-Za-z0-9_/-]+") || assetPath.contains("..") || assetPath.startsWith("/") || assetPath.contains("//")) {
            throw new IllegalArgumentException("Expected a relative Android asset directory");
        }
        Intent intent = new Intent(context, WorkersNativeActivity.class).putExtra("workersAssetPath", assetPath);
        if (!(context instanceof android.app.Activity)) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }
}
