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

    // Mode constants
    public static final String MODE_DEFAULT = "default";
    public static final String MODE_STORYBOOK = "storybook";
    public static final String MODE_TESTING = "testing";

    // Module state
    private static String syncDirectoryPath;
    private static JSONObject config = new JSONObject();
    private static JSONObject lastState = new JSONObject();
    private static String currentMode = MODE_DEFAULT;

    // Helper instances
    private final ReactApplicationContext reactContext;
    private final FileSystemHelper fileSystemHelper;
    private final InspectorHelper inspectorHelper;
    private final LastStateHelper lastStateHelper;
    private final ConfigHelper configHelper;
    private final StabilityHelper stabilityHelper;
    private final RestartHelper restartHelper;

    /**
     * Constructor - initializes all helpers and module state
     */
    public SherloModuleCore(ReactApplicationContext reactContext) {
        this.reactContext = reactContext;
        
        this.fileSystemHelper = new FileSystemHelper(reactContext);
        this.syncDirectoryPath = this.fileSystemHelper.setupSyncDirectory();

        this.configHelper = new ConfigHelper(this.fileSystemHelper, this.syncDirectoryPath);
        this.config = this.configHelper.loadConfig();

        this.restartHelper = new RestartHelper();
        
        currentMode = this.configHelper.determineInitialMode(this.config);
        
        if (currentMode.equals(MODE_TESTING)) {
            this.inspectorHelper = new InspectorHelper();
            this.stabilityHelper = new StabilityHelper();

            this.lastStateHelper = new LastStateHelper(this.fileSystemHelper, this.syncDirectoryPath);
            this.lastState = this.lastStateHelper.getLastState();
        }
    }
    
    /**
     * Get module constants
     */
    public Map<String, Object> getConstants() {
        final Map<String, Object> constants = new HashMap<>();
        constants.put("syncDirectoryPath", this.syncDirectoryPath);
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

    public void appendFile(String filepath, String base64Content, Promise promise) {
        fileSystemHelper.appendFile(filepath, base64Content, promise);
    }

    public void readFile(String filepath, Promise promise) {
        fileSystemHelper.readFile(filepath, promise);
    }

    public void getInspectorData(Activity activity, Promise promise) {
        if (currentMode.equals(MODE_TESTING)) {
            inspectorHelper.getInspectorData(activity, promise);
        }
    }

    public void checkIfStable(Activity activity, int requiredMatches, int intervalMs, int timeoutMs, Promise promise) {
        if (currentMode.equals(MODE_TESTING)) {
            stabilityHelper.checkIfStable(activity, requiredMatches, intervalMs, timeoutMs, promise);
        }
    }
} 