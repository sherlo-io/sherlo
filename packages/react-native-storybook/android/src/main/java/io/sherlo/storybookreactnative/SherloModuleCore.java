package io.sherlo.storybookreactnative;

// Android Framework Imports
import android.app.Activity;
import android.content.Context;
import android.util.Log;

// React Native Bridge Imports
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.Promise;

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

        if (this.config != null) {
            this.currentMode = ConfigHelper.determineModeFromConfig(this.config);

            Log.d(TAG, "SherloModuleCore initialized with mode: " + currentMode);
            
            if (currentMode.equals(MODE_TESTING)) {
                this.lastState = LastStateHelper.getLastState(this.fileSystemHelper);
            }
        }
    }
    
    /**
     * Returns constants exposed to the JavaScript side.
     * Provides access to the current mode, configuration and last state.
     * 
     * @return A map containing the module constants
     */
    public Map<String, Object> getConstants() {
        final Map<String, Object> constants = new HashMap<>();
        constants.put("mode", this.currentMode);
        constants.put("config", this.config != null ? this.config.toString() : null);
        constants.put("lastState", this.lastState != null ? this.lastState.toString() : null);
        return constants;
    }

    /**
     * Toggles between Storybook and default modes.
     * If currently in Storybook mode, switches to default, otherwise switches to Storybook.
     * 
     * @param activity The current activity
     * @param promise Promise to resolve or reject
     */
    public void toggleStorybook(Activity activity, Promise promise) {
        if (currentMode.equals(MODE_STORYBOOK)) {
            currentMode = MODE_DEFAULT;
        } else {
            currentMode = MODE_STORYBOOK;
        }

        RestartHelper.restart(activity, promise);
    }

    /**
     * Switches to Storybook mode and restarts the React context.
     * 
     * @param activity The current activity
     * @param promise Promise to resolve or reject
     */
    public void openStorybook(Activity activity, Promise promise) {
        currentMode = MODE_STORYBOOK;
        RestartHelper.restart(activity, promise);
    }

    /**
     * Switches to default mode and restarts the React context.
     * 
     * @param activity The current activity
     * @param promise Promise to resolve or reject
     */
    public void closeStorybook(Activity activity, Promise promise) {
        currentMode = MODE_DEFAULT;
        RestartHelper.restart(activity, promise);
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
    public void stabilize(Activity activity, int requiredMatches, int intervalMs, int timeoutMs, Promise promise) {
        StabilityHelper.stabilize(activity, requiredMatches, intervalMs, timeoutMs, promise);
    }
} 