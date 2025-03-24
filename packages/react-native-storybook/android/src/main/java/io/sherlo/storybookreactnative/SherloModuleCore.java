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
import java.io.File;

/**
 * Core implementation for the Sherlo module containing all business logic.
 * This class centralizes all module functionality and state management.
 */
public class SherloModuleCore {
    public static final String TAG = "SherloModuleCore";

    private final ReactApplicationContext reactContext;

    // Mode constants
    public static final String MODE_DEFAULT = "default";
    public static final String MODE_STORYBOOK = "storybook";
    public static final String MODE_TESTING = "testing";

    // Module state
    private static JSONObject config = new JSONObject();
    private static JSONObject lastState = new JSONObject();
    private static String currentMode = MODE_DEFAULT;

    // Helper instances
    private FileSystemHelper fileSystemHelper = null;
    private ConfigHelper configHelper = null;
    private RestartHelper restartHelper = null;
    private InspectorHelper inspectorHelper = null;
    private LastStateHelper lastStateHelper = null;
    private StabilityHelper stabilityHelper = null;

    /**
     * Constructor - initializes all helpers and module state
     */
    public SherloModuleCore(ReactApplicationContext reactContext) {
        this.reactContext = reactContext;
        
        this.restartHelper = new RestartHelper();
        this.fileSystemHelper = new FileSystemHelper(reactContext);
        this.configHelper = new ConfigHelper(this.fileSystemHelper);

        this.config = this.configHelper.loadConfig();
        this.currentMode = this.configHelper.determineInitialMode(this.config);
        
        if (currentMode.equals(MODE_TESTING)) {
            this.inspectorHelper = new InspectorHelper();
            this.stabilityHelper = new StabilityHelper();

            this.lastStateHelper = new LastStateHelper(this.fileSystemHelper);
            this.lastState = this.lastStateHelper.getLastState();
        }
    }
    
    /**
     * Get module constants
     */
    public Map<String, Object> getConstants() {
        final Map<String, Object> constants = new HashMap<>();
        constants.put("mode", this.currentMode);
        constants.put("config", this.config.toString());
        constants.put("lastState", this.lastState.toString());
        return constants;
    }

    /**
     * Toggles between Storybook and default mode.
     */
    public void toggleStorybook(Activity activity, Promise promise) {
        if (currentMode.equals(MODE_STORYBOOK)) {
            currentMode = MODE_DEFAULT;
        } else {
            currentMode = MODE_STORYBOOK;
        }

        this.restartHelper.restart(activity, promise);
    }

    /**
     * Opens Storybook mode.
     */
    public void openStorybook(Activity activity, Promise promise) {
        currentMode = MODE_STORYBOOK;
        this.restartHelper.restart(activity, promise);
    }

    /**
     * Closes Storybook and returns to default mode.
     */
    public void closeStorybook(Activity activity, Promise promise) {
        currentMode = MODE_DEFAULT;
        this.restartHelper.restart(activity, promise);
    }

    public void appendFile(String filename, String base64Content, Promise promise) {
        fileSystemHelper.appendFileWithPromise(filename, base64Content, promise);
    }

    public void readFile(String filename, Promise promise) {
        fileSystemHelper.readFileWithPromise(filename, promise);
    }

    public void getInspectorData(Activity activity, Promise promise) {
        if (inspectorHelper != null) {
            inspectorHelper.getInspectorData(activity, promise);
        } else {
            promise.reject("INSPECTOR_NOT_AVAILABLE", "Inspector is not available");
        }
    }

    public void stabilize(Activity activity, int requiredMatches, int intervalMs, int timeoutMs, Promise promise) {
        if (stabilityHelper != null) {
            stabilityHelper.stabilize(activity, requiredMatches, intervalMs, timeoutMs, promise);
        } else {
            promise.reject("STABILITY_HELPER_NOT_AVAILABLE", "Stability helper is not available");
        }
    }
} 