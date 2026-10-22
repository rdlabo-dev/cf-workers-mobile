package probe;

import android.app.*;
import android.content.Intent;
import android.os.*;
import android.view.*;
import android.view.accessibility.AccessibilityNodeInfo;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;

/** One UiAutomation connection, native taps, and strict accessibility assertions. */
public final class AccessibilityProbe extends Instrumentation {
    private Bundle arguments;
    private ActivityMonitor monitor;
    private Activity launched;
    @Override public void onCreate(Bundle args) { super.onCreate(args); arguments = args; start(); }
    private void report(String message) { Bundle b = new Bundle(); b.putString("stream", message + "\n"); sendStatus(0, b); }
    private AccessibilityNodeInfo find(AccessibilityNodeInfo node, String text) {
        if (node == null) return null;
        if (text.contentEquals(node.getText() == null ? "" : node.getText())) return node;
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo found = find(node.getChild(i), text);
            if (found != null) return found;
        }
        return null;
    }
    private AccessibilityNodeInfo awaitText(UiAutomation ui, String text) {
        long deadline = SystemClock.elapsedRealtime() + 10000;
        do {
            if ("clear".equals(arguments.getString("cache"))) ui.clearCache();
            AccessibilityNodeInfo node = find(ui.getRootInActiveWindow(), text);
            if (node != null && node.isVisibleToUser()) return node;
            SystemClock.sleep(100);
        } while (SystemClock.elapsedRealtime() < deadline);
        throw new AssertionError("Accessibility text missing: " + text);
    }
    private void click(UiAutomation ui, String text) {
        AccessibilityNodeInfo node = awaitText(ui, text);
        while (node != null && !node.isClickable()) node = node.getParent();
        if (node == null) throw new AssertionError("No clickable node: " + text);
        if ("action".equals(arguments.getString("input"))) {
            if (!node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) throw new AssertionError("Click failed: " + text);
        } else {
            android.graphics.Rect bounds = new android.graphics.Rect(); node.getBoundsInScreen(bounds);
            long time = SystemClock.uptimeMillis();
            for (int action : new int[] {MotionEvent.ACTION_DOWN, MotionEvent.ACTION_UP}) {
                MotionEvent event = MotionEvent.obtain(time, SystemClock.uptimeMillis(), action, bounds.centerX(), bounds.centerY(), 0);
                event.setSource(InputDevice.SOURCE_TOUCHSCREEN);
                boolean injected = ui.injectInputEvent(event, true); event.recycle();
                if (!injected) throw new AssertionError("Input injection failed: " + text);
            }
        }
    }
    private JSONObject tree(AccessibilityNodeInfo node) throws JSONException {
        if (node == null) return new JSONObject();
        JSONArray children = new JSONArray();
        for (int i = 0; i < node.getChildCount(); i++) children.put(tree(node.getChild(i)));
        return new JSONObject().put("text", String.valueOf(node.getText())).put("class", String.valueOf(node.getClassName())).put("visible", node.isVisibleToUser()).put("children", children);
    }
    private android.webkit.WebView webView(View view) {
        if (view instanceof android.webkit.WebView) return (android.webkit.WebView)view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup)view;
            for (int i = 0; i < group.getChildCount(); i++) {
                android.webkit.WebView found = webView(group.getChildAt(i));
                if (found != null) return found;
            }
        }
        return null;
    }
    private void save(String name, String value) throws IOException {
        try (FileOutputStream stream = new FileOutputStream(new File(getTargetContext().getFilesDir(), name))) { stream.write(value.getBytes(StandardCharsets.UTF_8)); }
    }
    private void captureFailure() throws Exception {
        save("accessibility-failure.json", tree(getUiAutomation().getRootInActiveWindow()).toString(2));
        android.graphics.Bitmap bitmap = getUiAutomation().takeScreenshot();
        if (bitmap != null) try (FileOutputStream file = new FileOutputStream(new File(getTargetContext().getFilesDir(), "accessibility-failure.png"))) { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, file); }
        CountDownLatch captured = new CountDownLatch(1);
        runOnMainSync(() -> {
            Activity activity = monitor.getLastActivity();
            if (activity == null) activity = launched;
            android.webkit.WebView view = webView(activity.getWindow().getDecorView());
            if (view == null) { report("No diagnostic WebView"); captured.countDown(); return; }
            view.evaluateJavascript("JSON.stringify({url:location.href,heading:document.querySelector('h1')?.textContent,body:document.body.innerText})", value -> {
                try { save("accessibility-failure-dom.json", value); } catch (Exception error) { report("DOM capture failed: " + error); }
                captured.countDown();
            });
        });
        if (!captured.await(5, TimeUnit.SECONDS)) throw new AssertionError("DOM capture timed out");
    }
    @Override public void onStart() {
        int passed = 0;
        Bundle output = new Bundle();
        try {
            for (String name : new String[] {"accessibility-failure.json", "accessibility-failure-dom.json", "accessibility-failure.png"}) {
                File previous = new File(getTargetContext().getFilesDir(), name);
                if (previous.exists() && !previous.delete()) throw new IOException("Cannot clear prior evidence: " + name);
            }
            String mode = arguments.getString("mode", "sdk");
            int rounds = Integer.parseInt(arguments.getString("rounds", "20"));
            UiAutomation ui = getUiAutomation();
            monitor = addMonitor(mode.equals("sdk") ? "jp.rdlabo.workerscapacitor.WorkersNativeActivity" : "probe.WebViewControl", null, false);
            Intent intent = new Intent().setClassName("probe.workersembed", mode.equals("sdk") ? "probe.Launcher" : "probe.WebViewControl").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            intent.putExtra("profile", mode.equals("profile"));
            launched = startActivitySync(intent);
            if (mode.equals("sdk")) click(ui, "Open Worker");
            awaitText(ui, "Worker Home");
            for (int i = 0; i < rounds; i++) {
                click(ui, "Next"); awaitText(ui, "Worker Next");
                click(ui, "Submit"); awaitText(ui, "Posted verified");
                passed++;
                report(new JSONObject().put("round", i).put("status", "passed").toString());
            }
            output.putString("stream", new JSONObject().put("mode", mode).put("status", "passed").put("rounds", passed).toString()+"\n");
            finish(Activity.RESULT_OK, output);
        } catch (Throwable failure) {
            try { captureFailure(); } catch (Throwable error) { report("Evidence capture failed: " + error); }
            output.putString("stream", "FAILED after " + passed + " rounds: " + failure + "\n");
            finish(Activity.RESULT_CANCELED, output);
        }
    }
}
