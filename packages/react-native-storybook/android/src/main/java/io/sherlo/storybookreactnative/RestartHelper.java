package io.sherlo.storybookreactnative;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.facebook.react.bridge.Promise;
import com.facebook.react.ReactApplication;
import com.facebook.react.ReactInstanceManager;

/**
 * Helper class for restarting the React Native application.
 * Provides methods to reload the JavaScript bundle and recreate the React context.
 */
public class RestartHelper {
    private static final String TAG = "RestartHelper";

    /**
     * Restarts the React Native application by reloading the JavaScript bundle.
     * Handles null activity cases and exceptions during restart.
     *
     * @param currentActivity The current activity
     * @param promise Promise to resolve when restart succeeds or reject when it fails
     */
    public static void restart(Activity currentActivity, Promise promise) {
        try {
            if (currentActivity == null) {
                promise.reject("ACTIVITY_NOT_FOUND", "Activity was not found");
                return;
            }

            loadBundle(currentActivity);
            promise.resolve(true);
        } catch (Exception e) {
            Log.e(TAG, "Error opening Storybook", e);
            promise.reject("error_open_storybook", "Error opening Storybook: " + e.getMessage(), e);
        }
    }

    /**
     * Reloads the JavaScript bundle using the React instance manager.
     * Falls back to legacy method if recreating the React context fails.
     *
     * @param currentActivity The current activity
     */
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

    /**
     * Fallback method for restarting the application when the React instance manager fails.
     * Simply recreates the activity, which causes a complete restart.
     *
     * @param currentActivity The current activity to recreate
     */
    public static void loadBundleLegacy(final Activity currentActivity) {
        currentActivity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                currentActivity.recreate();
            }
        });
    }
}
