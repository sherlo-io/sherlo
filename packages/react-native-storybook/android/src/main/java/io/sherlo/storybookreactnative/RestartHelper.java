package io.sherlo.storybookreactnative;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.facebook.react.ReactApplication;
import com.facebook.react.ReactInstanceManager;

public class RestartHelper {
    private static final String TAG = "RestartHelper";

    public static void loadBundle(Activity currentActivity) {
        try {
            if (currentActivity == null) {
                Log.e(TAG, "Current activity is null");
                return;
            }

            ReactApplication reactApplication = (ReactApplication) currentActivity.getApplication();
            final ReactInstanceManager instanceManager = reactApplication.getReactNativeHost().getReactInstanceManager();
            
            if (instanceManager == null) {
                Log.e(TAG, "ReactInstanceManager is null");
                return;
            }

            new Handler(Looper.getMainLooper()).post(new Runnable() {
                @Override
                public void run() {
                    try {
                        instanceManager.recreateReactContextInBackground();
                    } catch (Exception e) {
                        Log.e(TAG, "Error loading bundle", e);
                        loadBundleLegacy(currentActivity);
                    }
                }
            });

        } catch (Exception e) {
            Log.e(TAG, "Error in loadBundle", e);
            loadBundleLegacy(currentActivity);
        }
    }

    public static void loadBundleLegacy(final Activity currentActivity) {
        if (currentActivity == null) {
            return;
        }

        currentActivity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                currentActivity.recreate();
            }
        });
    }
}
