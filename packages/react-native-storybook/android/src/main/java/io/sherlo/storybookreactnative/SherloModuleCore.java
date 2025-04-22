package io.sherlo.storybookreactnative;

// Android Framework Imports
import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

// React Native Bridge Imports
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;

// Java Utility and IO Imports
import java.util.HashMap;
import java.util.Map;
import org.json.JSONObject;

/**
 * Core implementation for the Sherlo module containing all business logic.
 * Manages application modes (default, storybook, testing) and provides access to helper utilities.
 */
public class SherloModuleCore {
    private static final String TAG = "SherloModule:Core";
    private static final String PREFS_NAME = "SherloPreferences";
    private static final String MODE_KEY = "current_mode";
    private static final long MODE_EXPIRATION_MS = 5000; // 5 seconds

    private final ReactApplicationContext reactContext;

    // Mode constants
    public static final String MODE_DEFAULT = "default";
    public static final String MODE_STORYBOOK = "storybook";
    public static final String MODE_TESTING = "testing";

    // Module state
    private static JSONObject config = null;
    private static JSONObject lastState = null;
    private static String currentMode = MODE_DEFAULT;

    // Helper instances
    private FileSystemHelper fileSystemHelper = null;

    /**
     * Initializes the module with the React context and sets up all required helpers.
     * Loads configuration and determines the initial mode to use.
     * 
     * @param reactContext The React application context
     */
    public SherloModuleCore(ReactApplicationContext reactContext) {
        this.reactContext = reactContext;
        
        this.fileSystemHelper = new FileSystemHelper(reactContext);

        this.config = ConfigHelper.loadConfig(this.fileSystemHelper);

        // Check for persisted mode in SharedPreferences first
        String persistedModeValue = getPersistedMode();
        if (persistedModeValue != null) {
            // We have a valid persisted mode that hasn't expired, use it
            this.currentMode = persistedModeValue;
            Log.d(TAG, "Using persisted mode: " + currentMode);
        } else if (this.config != null) {
            // Fallback to config-based mode
            this.currentMode = ConfigHelper.determineModeFromConfig(this.config);
            Log.d(TAG, "Using config-based mode: " + currentMode);
            
            if (currentMode.equals(MODE_TESTING)) {
                this.lastState = LastStateHelper.getLastState(this.fileSystemHelper);
            }
        }
        
        Log.d(TAG, "SherloModuleCore initialized with mode: " + currentMode);
    }
    
    /**
     * Checks for a persisted mode in SharedPreferences.
     * If found, validates it's not expired and returns the mode.
     * Removes the entry from SharedPreferences regardless of whether it's used or not.
     * 
     * @return The persisted mode if valid, null otherwise
     */
    private String getPersistedMode() {
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
    private void persistMode(String mode) {
        // Use MODE_MULTI_PROCESS to ensure the preferences are shared across processes
        SharedPreferences prefs = reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_MULTI_PROCESS);
        long timestamp = System.currentTimeMillis();
        String value = mode + "-" + timestamp;
        
        boolean success = prefs.edit().putString(MODE_KEY, value).commit(); // Using commit() instead of apply() for immediate effect
        Log.d(TAG, "Persisted mode to SharedPreferences: " + value + " (success: " + success + ")");
    }
    
    /**
     * Returns constants exposed to the JavaScript side.
     * Provides access to the current mode, configuration and last state.
     * 
     * @return A map containing the module constants
     */
    public WritableMap getSherloConstants() {
        final WritableMap constants = Arguments.createMap();
        constants.putString("mode", this.currentMode);
        constants.putString("config", this.config != null ? this.config.toString() : null);
        constants.putString("lastState", this.lastState != null ? this.lastState.toString() : null);
        return constants;
    }

    /**
     * Toggles between Storybook and default modes.
     * If currently in Storybook mode, switches to default, otherwise switches to Storybook.
     * 
     * @param activity The current activity
     * @param promise Promise to resolve or reject
     */
    public void toggleStorybook(Promise promise) {
        String newMode = currentMode.equals(MODE_STORYBOOK) ? MODE_DEFAULT : MODE_STORYBOOK;
        persistMode(newMode);
        RestartHelper.restart(reactContext, promise);
    }

    /**
     * Switches to Storybook mode and restarts the React context.
     * 
     * @param activity The current activity
     * @param promise Promise to resolve or reject
     */
    public void openStorybook(Promise promise) {
        persistMode(MODE_STORYBOOK);
        RestartHelper.restart(reactContext, promise);
    }

    /**
     * Switches to default mode and restarts the React context.
     * 
     * @param activity The current activity
     * @param promise Promise to resolve or reject
     */
    public void closeStorybook(Promise promise) {
        persistMode(MODE_DEFAULT);
        RestartHelper.restart(reactContext, promise);
    }

    /**
     * Appends base64 encoded content to a file.
     * 
     * @param filename The name of the file to append to
     * @param base64Content The base64 encoded content to append
     * @param promise Promise to resolve or reject
     */
    public void appendFile(String filename, String base64Content, Promise promise) {
        fileSystemHelper.appendFileWithPromise(filename, base64Content, promise);
    }

    /**
     * Reads a file and returns its content as a base64 encoded string.
     * 
     * @param filename The name of the file to read
     * @param promise Promise to resolve with the content or reject with an error
     */
    public void readFile(String filename, Promise promise) {
        fileSystemHelper.readFileWithPromise(filename, promise);
    }

    /**
     * Gets UI inspector data from the current view hierarchy.
     * 
     * @param activity The current activity
     * @param promise Promise to resolve with the inspector data or reject with an error
     */
    public void getInspectorData(Activity activity, Promise promise) {
        InspectorHelper.getInspectorData(activity, promise);
    }

    /**
     * Checks if the UI is stable by comparing consecutive screenshots.
     * 
     * @param activity The current activity
     * @param requiredMatches The number of consecutive matching screenshots needed
     * @param intervalMs The interval between each screenshot (in milliseconds)
     * @param timeoutMs The overall timeout (in milliseconds)
     * @param promise Promise to resolve with the stability result or reject with an error
     */
    public void stabilize(Activity activity, int requiredMatches, int intervalMs, int timeoutMs, boolean saveScreenshots, Promise promise) {
        StabilityHelper.stabilize(activity, requiredMatches, intervalMs, timeoutMs, saveScreenshots, promise);
    }
} 