package probe;

import android.os.Bundle;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import jp.rdlabo.workerscapacitor.WorkersNative;

/** Existing native screen: the only SDK call is WorkersNative.open. */
public final class Launcher extends androidx.activity.ComponentActivity {
    private int visits;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        visits = state == null ? 0 : state.getInt("visits");
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        TextView status = new TextView(this);
        status.setText("Native host visits " + visits);
        layout.addView(status);
        for (String scenario : new String[] {"normal", "failure"}) {
            Button open = new Button(this);
            open.setText(scenario.equals("normal") ? "Open Worker" : "Open failed Worker");
            open.setAllCaps(false);
            open.setOnClickListener(view -> {
                status.setText("Native host visits " + ++visits);
                WorkersNative.open(this, scenario.equals("normal") ? "sdk-web" : "sdk-web-failure");
            });
            layout.addView(open);
        }
        setContentView(layout);
    }
    @Override public void onSaveInstanceState(Bundle state) {
        state.putInt("visits", visits);
        super.onSaveInstanceState(state);
    }
}
