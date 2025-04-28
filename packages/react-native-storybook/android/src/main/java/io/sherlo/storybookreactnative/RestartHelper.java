package io.sherlo.storybookreactnative;

import android.content.Intent;
import android.util.Log;

import com.facebook.react.bridge.ReactApplicationContext;

/**
 * Reliable Restart Helper for both architectures, including Bridgeless/Fabric
 */
public class RestartHelper {
    private static final String TAG = "SherloModule:RestartHelper";

    public static void restart(ReactApplicationContext reactContext, String mode) {
        Intent intent = reactContext.getPackageManager().getLaunchIntentForPackage(reactContext.getPackageName());

        if (intent != null) {
            Intent mainIntent = Intent.makeRestartActivityTask(intent.getComponent());

            // Add custom extras here:
            mainIntent.putExtra("persisted_mode", mode);

            reactContext.startActivity(mainIntent);
            Runtime.getRuntime().exit(0);
        } else {
            Log.e(TAG, "Launch intent is null");
        }
    }
}
