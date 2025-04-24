package io.sherlo.storybookreactnative;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import com.facebook.react.bridge.ReactApplicationContext;

/**
 * Helper class for persisting and retrieving application mode.
 * Handles the shared preferences storage and validation of mode data.
 */
public class ModePersistorHelper {
    private static final String TAG = "SherloModule:ModePersistor";
    private static final String PREFS_NAME = "SherloPreferences";
    private static final String MODE_KEY = "current_mode";
    private static final long MODE_EXPIRATION_MS = 5000; // 5 seconds

    private final ReactApplicationContext reactContext;

    /**
     * Initializes the helper with the React context.
     * 
     * @param reactContext The React application context
     */
    public ModePersistorHelper(ReactApplicationContext reactContext) {
        this.reactContext = reactContext;
    }

    /**
     * Checks for a persisted mode in SharedPreferences.
     * If found, validates it's not expired and returns the mode.
     * Removes the entry from SharedPreferences regardless of whether it's used or not.
     * 
     * @return The persisted mode if valid, null otherwise
     */
    public String getPersistedMode() {
        // Use MODE_MULTI_PROCESS to ensure the preferences are shared across processes
        SharedPreferences prefs = reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_MULTI_PROCESS);
        String storedValue = prefs.getString(MODE_KEY, null);
        
        Log.d(TAG, "Read from SharedPreferences: " + (storedValue != null ? storedValue : "null"));
        
        // Remove the persisted mode immediately as we're consuming it
        if (storedValue != null) {
            prefs.edit().remove(MODE_KEY).commit(); // Using commit() instead of apply() for immediate effect
            Log.d(TAG, "Removed persisted mode from SharedPreferences");
        }
        
        if (storedValue != null && !storedValue.isEmpty()) {
            try {
                String[] parts = storedValue.split("-");
                if (parts.length == 2) {
                    String mode = parts[0];
                    long timestamp = Long.parseLong(parts[1]);
                    long currentTime = System.currentTimeMillis();
                    long age = currentTime - timestamp;
                    
                    Log.d(TAG, "Persisted mode age: " + age + "ms, expiration: " + MODE_EXPIRATION_MS + "ms");
                    
                    // Check if the stored mode is still valid (not expired)
                    if (age <= MODE_EXPIRATION_MS) {
                        Log.d(TAG, "Using valid persisted mode: " + mode);
                        return mode;
                    } else {
                        Log.d(TAG, "Persisted mode expired: " + age + "ms old (limit: " + MODE_EXPIRATION_MS + "ms)");
                    }
                } else {
                    Log.e(TAG, "Invalid persisted mode format: " + storedValue);
                }
            } catch (Exception e) {
                Log.e(TAG, "Error parsing persisted mode: " + e.getMessage());
            }
        }
        
        return null;
    }
    
    /**
     * Persists the current mode to SharedPreferences with a timestamp.
     * 
     * @param mode The mode to persist
     */
    public void persistMode(String mode) {
        // Use MODE_MULTI_PROCESS to ensure the preferences are shared across processes
        SharedPreferences prefs = reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_MULTI_PROCESS);
        long timestamp = System.currentTimeMillis();
        String value = mode + "-" + timestamp;
        
        boolean success = prefs.edit().putString(MODE_KEY, value).commit(); // Using commit() instead of apply() for immediate effect
        Log.d(TAG, "Persisted mode to SharedPreferences: " + value + " (success: " + success + ")");
    }
} 