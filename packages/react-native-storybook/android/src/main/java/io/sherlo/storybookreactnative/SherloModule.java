package io.sherlo.storybookreactnative;

// Android Framework Imports
import android.app.Activity;
import android.util.Log;
import android.os.Handler;
import android.os.Looper;

// React Native Bridge Imports
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.ReactInstanceManager;
import com.facebook.react.ReactApplication;

// Java Utility and IO Imports
import java.io.File;
import java.util.HashMap;
import java.util.Map;

import io.sherlo.storybookreactnative.InspectorHelper;
import io.sherlo.storybookreactnative.RestartHelper;

public class SherloModule extends ReactContextBaseJavaModule {
    public static final String TAG = "SherloModule";
    private static final String CONFIG_FILENAME = "config.sherlo";
    private static final String PROTOCOL_FILENAME = "protocol.sherlo";

    private final ReactApplicationContext reactContext;
    private static String syncDirectoryPath = "";
    private static String mode = "default"; // "default" / "storybook" / "testing" / "verification"
    private FileSystemHelper fileSystemHelper;

    public SherloModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        this.fileSystemHelper = new FileSystemHelper(reactContext);
        Log.i(TAG, "Initializing SherloModule with default mode: " + this.mode);

        try {
            // Set Sherlo directory path, this is the directory that will be
            // used to sync files between the emulator and Sherlo Runner

            // https://developer.android.com/reference/android/content/Context#getExternalFilesDir(java.lang.String)
            File externalDirectory = this.getReactApplicationContext().getExternalFilesDir(null);
            if (externalDirectory != null) {
                this.syncDirectoryPath = externalDirectory.getAbsolutePath() + "/sherlo";
            } else {
                this.handleError("ERROR_MODULE_INIT", "External storage is not accessible");
            }

            // This is the path to the config file created by the Sherlo Runner
            String configPath = this.syncDirectoryPath + "/" + CONFIG_FILENAME;
            Log.i(TAG, "Looking for config file at: " + configPath);

            // If the file exists, we are it testing mode and will open the
            // Storybook in single activity mode, without launching the app
            File sherloConfigFile  = new File(configPath);
            if (sherloConfigFile.exists()) {
                Log.i(TAG, "Config file exists");
                String configJson = fileSystemHelper.readFile(configPath);
                JSONObject config = new JSONObject(configJson);

                if (config.has("overrideMode")) {
                    Log.i(TAG, "Running in " + config.getString("overrideMode") + " mode");
                    this.mode = config.getString("overrideMode");
                } else {
                    Log.i(TAG, "Running in testing mode");
                    this.mode = "testing";
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to initialize SherloModule", e);
            e.printStackTrace();
            this.handleError("ERROR_MODULE_INIT", e.getMessage());
        }
    }

    @Override
    public String getName() {
        return "SherloModule";
    }

    @Override
    public Map<String, Object> getConstants() {
        final Map<String, Object> constants = new HashMap<>();

        constants.put("syncDirectoryPath", this.syncDirectoryPath);
        constants.put("mode", this.mode);

        return constants;
    }

    @ReactMethod
    public void verifyIntegration(Promise promise) {
        Log.d(TAG, "Verifying integration");
        this.mode = "verification";
        RestartHelper.loadBundle(getCurrentActivity());
        promise.resolve(null);
    }

    @ReactMethod
    public void toggleStorybook(Promise promise) {
        Log.d(TAG, "Toggling Storybook");
        try {
            if (this.mode == "storybook") {
                closeStorybook(promise);
            } else {
                openStorybook(promise);
            }
        } catch (Exception e) {
            promise.reject("Error toggling Storybook", e.getMessage());
            Log.e(TAG, "Error toggling Storybook", e);
            e.printStackTrace();
        }
    }

    @ReactMethod
    public void openStorybook(Promise promise) {
        Log.d(TAG, "Opening Storybook");
        this.mode = "storybook";
        RestartHelper.loadBundle(getCurrentActivity());
        promise.resolve(null);
    }

    @ReactMethod
    public void closeStorybook(Promise promise) {
        Log.d(TAG, "Closing Storybook");
        this.mode = "default";
        RestartHelper.loadBundle(getCurrentActivity());
        promise.resolve(null);
    }

    /**
     * Create a directory at the specified path
     */
    @ReactMethod
    public void mkdir(String filepath, Promise promise) {
        try {
            fileSystemHelper.mkdir(filepath);
            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("Error creating directory", e.getMessage());
            Log.e(TAG, "Error creating directory", e);
            e.printStackTrace();
        }
    }

    /**
     * Append a base64 encoded file to the specified path
     */
    @ReactMethod
    public void appendFile(String filepath, String base64Content, Promise promise) {
        try {
            fileSystemHelper.appendFile(filepath, base64Content);
            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("Error appending file", e.getMessage());
            Log.e(TAG, "Error appending file", e);
            e.printStackTrace();
        }
    }

    /**
     * Read a byte array from the specified file and return it as a base64 string
     */
    @ReactMethod
    public void readFile(String filepath, Promise promise) {
        try {
            String base64Content = fileSystemHelper.readFile(filepath);
            promise.resolve(base64Content);
        } catch (Exception e) {
            promise.reject("Error reading file", e.getMessage());
            Log.e(TAG, "Error reading file", e);
            e.printStackTrace();
        }
    }

    @ReactMethod
    public void getInspectorData(Promise promise) {
        Activity activity = getCurrentActivity();
        if (activity == null) {
            promise.reject("no_activity", "No current activity");
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                String jsonString = InspectorHelper.getInspectorData(activity);
                promise.resolve(jsonString);
            } catch (Exception e) {
                promise.reject("error", e.getMessage(), e);
            }
        });
    }

    private void handleError(String errorCode, String errorMessage) {
        Log.e(TAG, "Error occurred: " + errorCode + ", Error: " + errorMessage);

        String protocolFilePath = this.syncDirectoryPath + "/" + PROTOCOL_FILENAME;

        // Create the new JSON object with the specified properties
        Map<String, Object> nativeErrorMap = new HashMap<>();
        nativeErrorMap.put("action", "NATIVE_ERROR");
        nativeErrorMap.put("errorCode", errorCode);
        nativeErrorMap.put("error", errorMessage);
        nativeErrorMap.put("timestamp", System.currentTimeMillis());
        nativeErrorMap.put("entity", "app");

        try {
            // Convert the map to JSON string
            String jsonString = new org.json.JSONObject(nativeErrorMap).toString();

            // Convert JSON string to base64
            String base64ErrorData = android.util.Base64.encodeToString(jsonString.getBytes("UTF-8"), android.util.Base64.NO_WRAP);

            // Append the base64 encoded error data to the protocol file
            fileSystemHelper.appendFile(protocolFilePath, base64ErrorData);
        } catch (Exception e) {
            Log.e(TAG, "Error writing to error file: " + e.getMessage());
        }
    }
}
