package io.sherlo.storybookreactnative;

// Android Framework Imports
import android.app.Activity;

// React Native Bridge Imports
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;

// Java Utility and IO Imports
import java.util.Map;

/**
 * Main React Native Native Module for Sherlo that exposes native functionality to JavaScript.
 * Acts as a thin wrapper around SherloModuleCore which implements the actual logic.
 */
public class SherloModule extends ReactContextBaseJavaModule {
    private final SherloModuleCore moduleCore;

    public SherloModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.moduleCore = new SherloModuleCore(reactContext);
    }

    @Override
    public String getName() {
        return "SherloModule";
    }

    @Override
    public Map<String, Object> getConstants() {
        return moduleCore.getConstants();
    }

    // ==== Storybook Methods ====

    @ReactMethod
    public void toggleStorybook(Promise promise) {
        Activity activity = getCurrentActivity();
        moduleCore.toggleStorybook(activity, promise);
    }

    @ReactMethod
    public void openStorybook(Promise promise) {
        Activity activity = getCurrentActivity();
        moduleCore.openStorybook(activity, promise);
    }

    @ReactMethod
    public void closeStorybook(Promise promise) {
        Activity activity = getCurrentActivity();
        moduleCore.closeStorybook(activity, promise);
    }

    // ==== File System Methods ====

    @ReactMethod
    public void appendFile(String filepath, String base64Content, Promise promise) {
        moduleCore.appendFile(filepath, base64Content, promise);
    }

    @ReactMethod
    public void readFile(String filepath, Promise promise) {
        moduleCore.readFile(filepath, promise);
    }

    // ==== Inspector Methods ====

    @ReactMethod
    public void getInspectorData(Promise promise) {
        Activity activity = getCurrentActivity();
        moduleCore.getInspectorData(activity, promise);
    }

    @ReactMethod
    public void checkIfStable(int requiredMatches, int intervalMs, int timeoutMs, Promise promise) {
        Activity activity = getCurrentActivity();
        moduleCore.checkIfStable(activity, requiredMatches, intervalMs, timeoutMs, promise);
    }
}
