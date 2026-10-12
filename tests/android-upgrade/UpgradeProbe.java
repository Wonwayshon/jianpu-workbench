package wang.weixuan.flutekeylab.upgradeprobe;

import android.app.Instrumentation;
import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;

/** Test-only companion APK: enables inspection of an unchanged, same-signed release APK. */
public final class UpgradeProbe extends Instrumentation {
    @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }
    @Override public void onStart() {
        try {
            Activity activity = startActivitySync(getTargetContext().getPackageManager()
                    .getLaunchIntentForPackage(getTargetContext().getPackageName()));
            runOnMainSync(() -> WebView.setWebContentsDebuggingEnabled(true));
            Bundle status = new Bundle(); status.putString("stream", "WebView inspection enabled for upgrade verification");
            sendStatus(1, status);
            Thread.sleep(3600000);
        } catch (Exception error) { Bundle status = new Bundle(); status.putString("stream", error.toString()); finish(1, status); }
    }
}
// Modified by AI on 2026-10-12 15:23:58
