package io.sherlo.storybookreactnative;

// Android Framework Imports
import android.app.Activity;

// React Native Bridge Imports
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.WritableMap;

// Java Utility and IO Imports
import java.util.Map;

/**
 * Legacy implementation of SherloModule for React Native for old architecture.
 * Native module that exposes Sherlo functionality to JavaScript.
 * Acts as a thin wrapper around SherloModuleCore which contains the actual implementation.
 */
public class SherloModule extends ReactContextBaseJavaModule {
    public static final String NAME = "SherloModule";
    private final SherloModuleCore moduleCore;

    /**
     * Initializes the module with the React context and creates the core implementation.
     *
     * @param reactContext The React Native application context
     */
    public SherloModule(ReactApplicationContext reactContext) {
        super(reactContext);
        Activity activity = getCurrentActivity();
        this.moduleCore = new SherloModuleCore(reactContext, activity);
    }

    /**
     * Returns the name of this module for React Native.
     *
     * @return The module name ("SherloModule")
     */
    @Override
    public String getName() {
        return NAME;
    }

    /**
     * Exposes constants to JavaScript, including mode, config, and state information.
     *
     * @return A map of constants for the JavaScript side
     */
    @Override
    public Map<String, Object> getConstants() {
        return moduleCore.getSherloConstants().toHashMap();
    }

    // ==== Storybook Methods ====

    /**
     * Toggles between Storybook and default mode.
     */
    @ReactMethod
    public void toggleStorybook() {
        moduleCore.toggleStorybook();
    }

    /**
     * Explicitly switches to Storybook mode.
     */
    @ReactMethod
    public void openStorybook() {
        moduleCore.openStorybook();
    }

    /**
     * Explicitly switches to default mode.
     */
    @ReactMethod
    public void closeStorybook() {
        moduleCore.closeStorybook();
    }

    // ==== File System Methods ====

    /**
     * Appends base64 encoded content to a file.
     *
     * @param filename The name of the file to append to
     * @param base64Content The base64 encoded content to append
     * @param promise Promise to resolve when the operation is complete
     */
    @ReactMethod
    public void appendFile(String filename, String base64Content, Promise promise) {
        moduleCore.appendFile(filename, base64Content, promise);
    }

    /**
     * Reads a file and returns its content as a base64 encoded string.
     *
     * @param filename The name of the file to read
     * @param promise Promise to resolve with the file content
     */
    @ReactMethod
    public void readFile(String filename, Promise promise) {
        moduleCore.readFile(filename, promise);
    }

    // ==== Inspector Methods ====

    /**
     * Gets UI inspector data from the current view hierarchy.
     *
     * @param promise Promise to resolve with the inspector data
     */
    @ReactMethod
    public void getInspectorData(Promise promise) {
        Activity activity = getCurrentActivity();
        moduleCore.getInspectorData(activity, promise);
    }

    /**
     * Checks if the UI is stable by comparing consecutive screenshots.
     *
     * @param requiredMatches The number of consecutive matching screenshots needed
     * @param minScreenshotsCount The minimum number of screenshots to take when checking for stability
     * @param intervalMs The interval between each screenshot in milliseconds
     * @param timeoutMs The overall timeout in milliseconds
     * @param saveScreenshots Whether to save screenshots to the file system
     * @param threshold Matching threshold (0.0 to 1.0); smaller values are more sensitive
     * @param includeAA If false, ignore anti-aliased pixels when counting differences
     * @param promise Promise to resolve with true if UI becomes stable, false if timeout occurs
     */
    @ReactMethod
    public void stabilize(int requiredMatches, int minScreenshotsCount, int intervalMs, int timeoutMs, boolean saveScreenshots, double threshold, boolean includeAA, Promise promise) {
        Activity activity = getCurrentActivity();
        moduleCore.stabilize(activity, requiredMatches, minScreenshotsCount, intervalMs, timeoutMs, saveScreenshots, threshold, includeAA, promise);
    }

    /**
     * Detects if the currently visible screen can be vertically scrolled for long-screenshot capture.
     *
     * @param promise Promise to resolve with boolean (true if scrollable, false otherwise)
     */
    @ReactMethod
    public void isScrollableSnapshot(Promise promise) {
        Activity activity = getCurrentActivity();
        moduleCore.isScrollableSnapshot(activity, promise);
    }

    /**
     * Deterministically scrolls to a checkpoint index.
     *
     * @param index The checkpoint index (0-based)
     * @param offset The vertical offset per checkpoint (in pixels)
     * @param maxIndex The maximum allowed index
     */
    @ReactMethod
    public void scrollToCheckpoint(double index, double offset, double maxIndex, Promise promise) {
        Activity activity = getCurrentActivity();
        moduleCore.scrollToCheckpoint(activity, index, offset, maxIndex, promise);
    }
}
