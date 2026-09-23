package io.sherlo.storybookreactnative;


import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import com.facebook.react.ReactApplication;
import com.facebook.react.ReactInstanceManager;
import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.jakewharton.processphoenix.ProcessPhoenix;
import com.facebook.react.bridge.Promise;

import static io.sherlo.storybookreactnative.SherloModuleCore.MODE_DEFAULT;
import static io.sherlo.storybookreactnative.SherloModuleCore.MODE_STORYBOOK;
import static io.sherlo.storybookreactnative.SherloModuleCore.MODE_TESTING;


public class RestartHelper {

    private static final String TAG = "RestartHelper";
    private static final String REACT_APPLICATION_CLASS_NAME = "com.facebook.react.ReactApplication";
    private static final String REACT_NATIVE_HOST_CLASS_NAME = "com.facebook.react.ReactNativeHost";
    private static final String PREFS_NAME = "SherloPrefs";
    private static final String PREF_MODE = "mode";
    private static final String PREF_MODE_TIMESTAMP = "modeTimestamp";
    private static final String PREF_INITIAL_STORY_ID = "initialStoryId";
    private static final long MODE_PERSISTENCE_TIMEOUT_MS = 10000;

    private ReactApplicationContext reactContext = null;

    private LifecycleEventListener mLifecycleEventListener = null;

    public RestartHelper(ReactApplicationContext reactContext) {
        this.reactContext = reactContext;
    }

    /**
     * Persists the mode to come back up in, with a timestamp, but only when it is a mode the
     * app should survive a restart in (storybook or testing). A default-mode restart clears any
     * persisted mode: default is what config already resolves to, and persisting it would hide
     * a config change.
     */
    private void persistMode(String mode) {
        persistMode(mode, null);
    }

    /**
     * The same persistence as {@link #persistMode(String)}, plus the story a testing-mode restart
     * should land on directly - a capture's first story of a session, handed over the same way a
     * run's restart always has a story to hand over as `initialSelection` (see captureTransport.ts).
     *
     * THIS IS NOT A NEW KIND OF WRITE. `mode` itself already has to survive the same restart
     * (ProcessPhoenix kills the process), so it already crosses through this exact SharedPreferences
     * slot - ephemeral, read once, cleared after. `storyId` rides in the same slot rather than
     * opening a second one: one small write to survive one restart, not two.
     *
     * `storyId` is ignored outside `MODE_TESTING` - only a capture's restart-into-testing has a
     * story to hand over - and cleared whenever this call does not carry one, so a stale value from
     * an earlier restart can never leak into a later one that did not ask for it.
     */
    private void persistMode(String mode, String storyId) {
        SharedPreferences prefs = reactContext.getSharedPreferences(PREFS_NAME, 0);

        if (MODE_STORYBOOK.equals(mode) || MODE_TESTING.equals(mode)) {
            SharedPreferences.Editor editor = prefs.edit()
                .putString(PREF_MODE, mode)
                .putLong(PREF_MODE_TIMESTAMP, System.currentTimeMillis())
                .remove(PREF_INITIAL_STORY_ID);

            if (MODE_TESTING.equals(mode) && storyId != null && !storyId.isEmpty()) {
                editor.putString(PREF_INITIAL_STORY_ID, storyId);
            }

            editor.apply();
            Log.d(TAG, "Persisted mode for restart: " + mode);
        } else {
            prefs.edit()
                .remove(PREF_MODE)
                .remove(PREF_MODE_TIMESTAMP)
                .remove(PREF_INITIAL_STORY_ID)
                .apply();
            Log.d(TAG, "Cleared persisted mode (switching to: " + mode + ")");
        }
    }

    /**
     * Retrieves the persisted mode from SharedPreferences if it's recent enough.
     * Returns the mode name if still valid, otherwise null (for config fallback).
     * Clears the persisted state after reading (one-time use).
     */
    public String getPersistedMode() {
        SharedPreferences prefs = reactContext.getSharedPreferences(PREFS_NAME, 0);
        String mode = prefs.getString(PREF_MODE, null);
        long timestamp = prefs.getLong(PREF_MODE_TIMESTAMP, 0);

        if (mode != null && timestamp > 0) {
            long timeDiff = System.currentTimeMillis() - timestamp;

            if (timeDiff <= MODE_PERSISTENCE_TIMEOUT_MS) {
                prefs.edit()
                    .remove(PREF_MODE)
                    .remove(PREF_MODE_TIMESTAMP)
                    .apply();

                Log.d(TAG, "Using persisted mode from restart (age: " + timeDiff + "ms): " + mode);
                return mode;
            } else {
                // Expired, clear it - the initial story id too, so an expired testing-mode restart
                // never leaves one behind for a later, unrelated restart to pick up.
                prefs.edit()
                    .remove(PREF_MODE)
                    .remove(PREF_MODE_TIMESTAMP)
                    .remove(PREF_INITIAL_STORY_ID)
                    .apply();

                Log.d(TAG, "Persisted mode expired (age: " + timeDiff + "ms), no persisted mode");
            }
        }

        return null;
    }

    /**
     * The story a persisted testing-mode restart should land on, read once and cleared - the
     * Android half of the hand-over described on {@link #persistMode(String, String)}. Call only
     * after {@link #getPersistedMode()} has returned `testing`: a story id is meaningless, and never
     * written, for any other persisted mode.
     *
     * @return the story id, or null when this restart carried none.
     */
    public String getPersistedInitialStoryId() {
        SharedPreferences prefs = reactContext.getSharedPreferences(PREFS_NAME, 0);
        String storyId = prefs.getString(PREF_INITIAL_STORY_ID, null);

        if (storyId != null) {
            prefs.edit().remove(PREF_INITIAL_STORY_ID).apply();
        }

        return storyId;
    }

    private Activity getCurrentActivity() {
        return reactContext.getCurrentActivity();
    }

    private ReactApplicationContext getReactApplicationContext() {
        return reactContext;
    }

    private void loadBundleLegacy() {
        final Activity currentActivity = getCurrentActivity();
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

    private void loadBundle() {
        clearLifecycleEventListener();
        try {
            final ReactInstanceManager instanceManager = resolveInstanceManager();
            if (instanceManager == null) {
                return;
            }

            new Handler(Looper.getMainLooper()).post(new Runnable() {
                @Override
                public void run() {
                    try {
                        instanceManager.recreateReactContextInBackground();
                    } catch (Throwable t) {
                        loadBundleLegacy();
                    }
                }
            });

        } catch (Throwable t) {
            loadBundleLegacy();
        }
    }

    private static ReactInstanceHolder mReactInstanceHolder;

    static ReactInstanceManager getReactInstanceManager() {
        if (mReactInstanceHolder == null) {
            return null;
        }
        return mReactInstanceHolder.getReactInstanceManager();
    }

    private ReactInstanceManager resolveInstanceManager() throws NoSuchFieldException, IllegalAccessException {
        ReactInstanceManager instanceManager = getReactInstanceManager();
        if (instanceManager != null) {
            return instanceManager;
        }

        final Activity currentActivity = getCurrentActivity();
        if (currentActivity == null) {
            return null;
        }

        ReactApplication reactApplication = (ReactApplication) currentActivity.getApplication();
        instanceManager = reactApplication.getReactNativeHost().getReactInstanceManager();

        return instanceManager;
    }

    private void clearLifecycleEventListener() {
        if (mLifecycleEventListener != null) {
            getReactApplicationContext().removeLifecycleEventListener(mLifecycleEventListener);
            mLifecycleEventListener = null;
        }
    }

    public void restart(String newMode) {
        restart(newMode, null);
    }

    /**
     * The same restart, with a story to persist alongside `newMode` for the app that comes back -
     * see {@link #persistMode(String, String)}.
     */
    public void restart(String newMode, String storyId) {

        persistMode(newMode, storyId);

        final Activity currentActivity = getCurrentActivity();
        if (currentActivity != null) {
            ProcessPhoenix.triggerRebirth(currentActivity);
        }
    }
}