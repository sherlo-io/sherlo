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


public class RestartHelper {

    private static final String TAG = "RestartHelper";
    private static final String REACT_APPLICATION_CLASS_NAME = "com.facebook.react.ReactApplication";
    private static final String REACT_NATIVE_HOST_CLASS_NAME = "com.facebook.react.ReactNativeHost";
    private static final String PREFS_NAME = "SherloPrefs";
    private static final String PREF_STORYBOOK_ENABLED = "storybookEnabled";
    private static final String PREF_STORYBOOK_TIMESTAMP = "storybookEnabledTimestamp";
    private static final String PREF_ACTIVE_STORY_ID = "activeStoryId";
    private static final String PREF_ACTIVE_STORY_TIMESTAMP = "activeStoryIdTimestamp";
    private static final long MODE_PERSISTENCE_TIMEOUT_MS = 10000; 
    
    private ReactApplicationContext reactContext = null;

    private LifecycleEventListener mLifecycleEventListener = null;

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
     * Persists active story ID with timestamp for mock transformation.
     * Preserves existing mode state.
     * 
     * @param storyId The story ID to persist, or null to clear it
     */
    public void persistStoryId(String storyId) {
        SharedPreferences prefs = reactContext.getSharedPreferences(PREFS_NAME, 0);
        SharedPreferences.Editor editor = prefs.edit();
        
        if (storyId != null && !storyId.isEmpty()) {
            editor.putString(PREF_ACTIVE_STORY_ID, storyId)
                  .putLong(PREF_ACTIVE_STORY_TIMESTAMP, System.currentTimeMillis());
            Log.d(TAG, "Persisted active story ID for restart: " + storyId);
        } else {
            editor.remove(PREF_ACTIVE_STORY_ID)
                  .remove(PREF_ACTIVE_STORY_TIMESTAMP);
            Log.d(TAG, "Cleared persisted active story ID");
        }
        
        editor.apply();
    }

    /**
     * Retrieves the persisted story ID if it's recent enough.
     * Clears the persisted state after reading (one-time use).
     * 
     * @return The story ID if valid, or null
     */
    public String getPersistedStoryId() {
        SharedPreferences prefs = reactContext.getSharedPreferences(PREFS_NAME, 0);
        String storyId = prefs.getString(PREF_ACTIVE_STORY_ID, null);
        long timestamp = prefs.getLong(PREF_ACTIVE_STORY_TIMESTAMP, 0);
        
        if (storyId != null && timestamp > 0) {
            long timeDiff = System.currentTimeMillis() - timestamp;
            
            if (timeDiff <= MODE_PERSISTENCE_TIMEOUT_MS) {
                prefs.edit()
                    .remove(PREF_ACTIVE_STORY_ID)
                    .remove(PREF_ACTIVE_STORY_TIMESTAMP)
                    .apply();
                
                Log.d(TAG, "Using persisted story ID from restart (age: " + timeDiff + "ms): " + storyId);
                return storyId;
            } else {
                // Expired, clear it
                prefs.edit()
                    .remove(PREF_ACTIVE_STORY_ID)
                    .remove(PREF_ACTIVE_STORY_TIMESTAMP)
                    .apply();
                
                Log.d(TAG, "Persisted story ID expired (age: " + timeDiff + "ms)");
            }
        }
        
        return null;
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
        persistMode(newMode);
        
        final Activity currentActivity = getCurrentActivity();
        if (currentActivity != null) {
            ProcessPhoenix.triggerRebirth(currentActivity);
        }
    }

    /**
     * Restarts with a story ID, preserving the current mode.
     * This is used when switching stories within Storybook to trigger mock transformation.
     * 
     * @param storyId The story ID to persist, or null to clear it
     */
    public void restartWithStoryId(String storyId) {
        // Preserve existing mode if it exists
        SharedPreferences prefs = reactContext.getSharedPreferences(PREFS_NAME, 0);
        boolean hasStorybookMode = prefs.getBoolean(PREF_STORYBOOK_ENABLED, false);
        
        if (hasStorybookMode) {
            // Re-persist the mode to keep it alive
            persistMode(MODE_STORYBOOK);
        }
        
        // Persist the story ID
        persistStoryId(storyId);
        
        final Activity currentActivity = getCurrentActivity();
        if (currentActivity != null) {
            ProcessPhoenix.triggerRebirth(currentActivity);
        }
    }
}