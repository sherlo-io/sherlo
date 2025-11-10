package io.sherlo.storybookreactnative;

// Android Framework Imports
import android.app.Activity;
import android.content.Context;
import android.util.Log;
import android.content.Intent;
import android.content.SharedPreferences;

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
    private RestartHelper restartHelper = null;

    /**
     * Initializes the module with the React context and sets up all required helpers.
     * Loads configuration and determines the initial mode to use.
     * 
     * @param reactContext The React application context
     */
    public SherloModuleCore(ReactApplicationContext reactContext, Activity activity) {
        this.fileSystemHelper = new FileSystemHelper(reactContext);
        this.restartHelper = new RestartHelper(reactContext);

        this.config = ConfigHelper.loadConfig(this.fileSystemHelper);

        String persistedMode = restartHelper.getPersistedMode();
        if (persistedMode != null) {
            // We have a valid persisted mode that hasn't expired, use it
            this.currentMode = persistedMode;
            Log.d(TAG, "Using persisted mode: " + currentMode);
        } else if (this.config != null) {
            // Fallback to config-based mode
            this.currentMode = ConfigHelper.determineModeFromConfig(this.config);
            Log.d(TAG, "Using config-based mode: " + currentMode);
            
            if (currentMode.equals(MODE_TESTING)) {
                this.lastState = LastStateHelper.getLastState(this.fileSystemHelper);

                String requestId = null;
                if (this.lastState != null) {
                    try {
                        requestId = this.lastState.getString("requestId");
                    } catch (org.json.JSONException e) {
                        Log.e(TAG, "Error getting requestId from lastState", e);
                    }
                }

                JSONObject nativeLoadedProtocolItem = new JSONObject();
                try {
                    nativeLoadedProtocolItem.put("action", "NATIVE_LOADED");
                    if (requestId != null) {
                        nativeLoadedProtocolItem.put("requestId", requestId);
                    }
                    nativeLoadedProtocolItem.put("timestamp", System.currentTimeMillis());
                    nativeLoadedProtocolItem.put("entity", "app");

                    this.fileSystemHelper.appendFile("protocol.sherlo", nativeLoadedProtocolItem.toString() + "\n");
                } catch (org.json.JSONException e) {
                    Log.e(TAG, "Error creating protocol item", e);
                }
            }
        }

        Log.d(TAG, "SherloModuleCore initialized with mode: " + currentMode);
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
     */
    public void toggleStorybook() {
        String newMode = currentMode.equals(MODE_STORYBOOK) ? MODE_DEFAULT : MODE_STORYBOOK;
        restartHelper.restart(newMode);
    }

    /**
     * Switches to Storybook mode and restarts the React context.
     */
    public void openStorybook() {
        restartHelper.restart(MODE_STORYBOOK);
    }

    /**
     * Switches to default mode and restarts the React context.
     */
    public void closeStorybook() {
        restartHelper.restart(MODE_DEFAULT);
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
     * @param minScreenshotsCount The minimum number of screenshots to take when checking for stability
     * @param intervalMs The interval between each screenshot (in milliseconds)
     * @param timeoutMs The overall timeout (in milliseconds)
     * @param saveScreenshots Whether to save screenshots to filesystem during tests
     * @param threshold Matching threshold (0.0 to 1.0); smaller values are more sensitive
     * @param includeAA If false, ignore anti-aliased pixels when counting differences
     * @param promise Promise to resolve with the stability result or reject with an error
     */
    public void stabilize(Activity activity, int requiredMatches, int minScreenshotsCount, int intervalMs, int timeoutMs, boolean saveScreenshots, double threshold, boolean includeAA, Promise promise) {
        StabilityHelper.stabilize(activity, requiredMatches, minScreenshotsCount, intervalMs, timeoutMs, saveScreenshots, threshold, includeAA, promise);
    }
} 