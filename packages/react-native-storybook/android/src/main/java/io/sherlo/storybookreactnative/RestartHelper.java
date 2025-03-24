package io.sherlo.storybookreactnative;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.facebook.react.bridge.Promise;
import com.facebook.react.ReactApplication;
import com.facebook.react.ReactInstanceManager;

public class RestartHelper {
    private static final String TAG = "RestartHelper";

    public RestartHelper() {}

    public void restart(Activity currentActivity, Promise promise) {
        try {
            if (currentActivity == null) {
                promise.reject("ACTIVITY_NOT_FOUND", "Activity was not found");
                return;
            }

            RestartHelper.loadBundle(currentActivity);
            promise.resolve(true);
        } catch (Exception e) {
            Log.e(TAG, "Error opening Storybook", e);
            promise.reject("error_open_storybook", "Error opening Storybook: " + e.getMessage(), e);
        }
    }

    private static void loadBundle(Activity currentActivity) {
        try {
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
        currentActivity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                currentActivity.recreate();
            }
        });
    }
}
