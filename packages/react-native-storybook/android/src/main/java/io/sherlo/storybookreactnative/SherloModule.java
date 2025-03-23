package io.sherlo.storybookreactnative;

// Android Framework Imports
import android.app.Activity;
import android.util.Log;

// React Native Bridge Imports
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;

// Java Utility and IO Imports
import java.util.HashMap;
import java.util.Map;
import org.json.JSONObject;

/**
 * Main React Native Native Module for Sherlo that exposes native functionality to JavaScript.
 * Acts as a thin wrapper around helper classes that implement the actual logic.
 */
public class SherloModule extends ReactContextBaseJavaModule {
    public static final String TAG = "SherloModule";

    // Core helpers
    private final ReactApplicationContext reactContext;
    private final FileSystemHelper fileSystemHelper;
    private final ErrorHelper errorHelper;
    private final InspectorHelper inspectorHelper;
    private final StorybookMethodHandler storybookHandler;
    private final LastStateHelper lastStateHelper;
    
    // Module state
    private String syncDirectoryPath;
    private JSONObject config;
    private JSONObject lastState;

    public SherloModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        
        // Initialize temporary FileSystemHelper for initialization
        FileSystemHelper tempFileSystemHelper = new FileSystemHelper(reactContext);
        
        // Initialize module
        ModuleInitHelper.InitResult initResult = ModuleInitHelper.initialize(
            this.getReactApplicationContext(), 
            tempFileSystemHelper,
            new ErrorHelper(tempFileSystemHelper, "")
        );
        
        // Set up state from initialization
        this.syncDirectoryPath = initResult.syncDirectoryPath;
        this.config = initResult.config;
        
        // Set the mode
        ModeHelper.setMode(initResult.mode);
        
        // Initialize helpers with proper error handling
        this.errorHelper = new ErrorHelper(tempFileSystemHelper, syncDirectoryPath);
        this.fileSystemHelper = new FileSystemHelper(reactContext, this.errorHelper);
        this.inspectorHelper = new InspectorHelper(this.errorHelper);
        this.lastStateHelper = new LastStateHelper(this.fileSystemHelper, this.errorHelper, this.syncDirectoryPath);
        
        // Get the last state
        this.lastState = this.lastStateHelper.getLastState();
        
        // StorybookMethodHandler still makes sense as a separate class
        this.storybookHandler = new StorybookMethodHandler(this.errorHelper);
    }

    @Override
    public String getName() {
        return "SherloModule";
    }

    @Override
    public Map<String, Object> getConstants() {
        final Map<String, Object> constants = new HashMap<>();
        constants.put("syncDirectoryPath", this.syncDirectoryPath);
        constants.put("mode", ModeHelper.getCurrentMode());
        constants.put("config", this.config.toString());
        constants.put("lastState", this.lastState.toString());
        return constants;
    }

    // ==== Storybook Methods ====

    @ReactMethod
    public void toggleStorybook(Promise promise) {
        Activity activity = getCurrentActivity();
        storybookHandler.toggleStorybook(activity, promise);
    }

    @ReactMethod
    public void openStorybook(Promise promise) {
        Activity activity = getCurrentActivity();
        storybookHandler.openStorybook(activity, promise);
    }

    @ReactMethod
    public void closeStorybook(Promise promise) {
        Activity activity = getCurrentActivity();
        storybookHandler.closeStorybook(activity, promise);
    }

    // ==== File System Methods ====

    @ReactMethod
    public void mkdir(String filepath, Promise promise) {
        fileSystemHelper.mkdir(filepath, promise);
    }

    @ReactMethod
    public void appendFile(String filepath, String base64Content, Promise promise) {
        fileSystemHelper.appendFile(filepath, base64Content, promise);
    }

    @ReactMethod
    public void readFile(String filepath, Promise promise) {
        fileSystemHelper.readFile(filepath, promise);
    }

    // ==== Inspector Methods ====

    @ReactMethod
    public void getInspectorData(Promise promise) {
        Activity activity = getCurrentActivity();
        inspectorHelper.getInspectorData(activity, promise);
    }

    @ReactMethod
    public void checkIfStable(int requiredMatches, int intervalMs, int timeoutMs, Promise promise) {
        Activity activity = getCurrentActivity();
        inspectorHelper.checkIfStable(activity, requiredMatches, intervalMs, timeoutMs, promise);
    }

    @ReactMethod
    public void clearFocus(Promise promise) {
        Activity activity = getCurrentActivity();
        inspectorHelper.clearFocus(activity, promise);
    }
}
