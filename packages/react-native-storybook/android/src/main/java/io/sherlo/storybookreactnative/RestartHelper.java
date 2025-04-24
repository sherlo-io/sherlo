package io.sherlo.storybookreactnative;

import android.content.Intent;
import android.util.Log;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.Promise;

/**
 * Reliable Restart Helper for both architectures, including Bridgeless/Fabric
 */
public class RestartHelper {
    private static final String TAG = "SherloModule:RestartHelper";

    public static void restart(ReactApplicationContext reactContext) {
        Intent intent = reactContext.getPackageManager().getLaunchIntentForPackage(reactContext.getPackageName());

        if (intent != null) {
            Intent mainIntent = Intent.makeRestartActivityTask(intent.getComponent());
            reactContext.startActivity(mainIntent);
            Runtime.getRuntime().exit(0);
        }
    }
}
