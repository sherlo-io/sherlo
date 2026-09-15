package io.sherlo.storybookreactnative;

import android.app.Activity;
import android.content.SharedPreferences;
import android.util.Log;
import com.facebook.react.bridge.ReactApplicationContext;
import com.jakewharton.processphoenix.ProcessPhoenix;

import static io.sherlo.storybookreactnative.SherloModuleCore.MODE_STORYBOOK;

public class RestartHelper {

    private static final String TAG = "RestartHelper";
    private static final String PREFS_NAME = "SherloPrefs";
    private static final String PREF_STORYBOOK_ENABLED = "storybookEnabled";
    private static final String PREF_STORYBOOK_TIMESTAMP = "storybookEnabledTimestamp";
    private static final long MODE_PERSISTENCE_TIMEOUT_MS = 10000;

    private ReactApplicationContext reactContext = null;

    public RestartHelper(ReactApplicationContext reactContext) {
        this.reactContext = reactContext;
    }

    /**
     * Persists storybook mode state with timestamp, but only if it's MODE_STORYBOOK
     * If MODE_DEFAULT, removes any existing persisted state
     */
    private void persistMode(String mode) {
        SharedPreferences prefs = reactContext.getSharedPreferences(PREFS_NAME, 0);

        if (MODE_STORYBOOK.equals(mode)) {
            prefs.edit()
                .putBoolean(PREF_STORYBOOK_ENABLED, true)
                .putLong(PREF_STORYBOOK_TIMESTAMP, System.currentTimeMillis())
                .apply();
            Log.d(TAG, "Persisted storybook mode enabled for restart");
        } else {
            prefs.edit()
                .remove(PREF_STORYBOOK_ENABLED)
                .remove(PREF_STORYBOOK_TIMESTAMP)
                .apply();
            Log.d(TAG, "Cleared persisted storybook mode (switching to: " + mode + ")");
        }
    }

    /**
     * Retrieves the persisted mode from SharedPreferences if it's recent enough
     * Returns MODE_STORYBOOK if enabled and valid, otherwise null (for config fallback)
     * Clears the persisted state after reading (one-time use)
     */
    public String getPersistedMode() {
        SharedPreferences prefs = reactContext.getSharedPreferences(PREFS_NAME, 0);
        boolean storybookEnabled = prefs.getBoolean(PREF_STORYBOOK_ENABLED, false);
        long timestamp = prefs.getLong(PREF_STORYBOOK_TIMESTAMP, 0);

        if (storybookEnabled && timestamp > 0) {
            long timeDiff = System.currentTimeMillis() - timestamp;

            if (timeDiff <= MODE_PERSISTENCE_TIMEOUT_MS) {
                prefs.edit()
                    .remove(PREF_STORYBOOK_ENABLED)
                    .remove(PREF_STORYBOOK_TIMESTAMP)
                    .apply();

                Log.d(TAG, "Using persisted storybook mode from restart (age: " + timeDiff + "ms)");
                return MODE_STORYBOOK;
            } else {
                // Expired, clear it
                prefs.edit()
                    .remove(PREF_STORYBOOK_ENABLED)
                    .remove(PREF_STORYBOOK_TIMESTAMP)
                    .apply();

                Log.d(TAG, "Persisted storybook mode expired (age: " + timeDiff + "ms), no persisted mode");
            }
        }

        return null;
    }

    private Activity getCurrentActivity() {
        return reactContext.getCurrentActivity();
    }

    public void restart(String newMode) {
        persistMode(newMode);

        final Activity currentActivity = getCurrentActivity();
        if (currentActivity != null) {
            ProcessPhoenix.triggerRebirth(currentActivity);
        }
    }
}
