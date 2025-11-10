package io.sherlo.storybookreactnative;

// Android Framework Imports
import android.app.Activity;

import androidx.annotation.NonNull;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.WritableMap;

// Java Utility and IO Imports
import java.util.Map;
/**
 * This implementation works with the New Architecture as a TurboModule.
 * This class needs to match the JS spec in NativeSherloModule.ts
 * The actual generated interface will be created by codegen at build time.
 */
public class SherloModule extends NativeSherloModuleSpec {
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
    @NonNull
    public String getName() {
        return NAME;
    }

    /**
     * Exposes constants to JavaScript, including mode, config, and state information.
     *
     * @return A map of constants for the JavaScript side
     */
    @Override
    public WritableMap getSherloConstants() {
        return moduleCore.getSherloConstants();
    }

    // ==== Storybook Methods ====

    /**
     * Toggles between Storybook and default mode.
     */
    @Override
    public void toggleStorybook() {
        moduleCore.toggleStorybook();
    }

    /**
     * Explicitly switches to Storybook mode.
     */
    @Override
    public void openStorybook() {
        moduleCore.openStorybook();
    }

    /**
     * Explicitly switches to default mode.
     */
    @Override
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
    @Override
    public void appendFile(String filename, String base64Content, Promise promise) {
        moduleCore.appendFile(filename, base64Content, promise);
    }

    /**
     * Reads a file and returns its content as a base64 encoded string.
     *
     * @param filename The name of the file to read
     * @param promise Promise to resolve with the file content
     */
    @Override
    public void readFile(String filename, Promise promise) {
        moduleCore.readFile(filename, promise);
    }

    // ==== Inspector Methods ====

    /**
     * Gets UI inspector data from the current view hierarchy.
     *
     * @param promise Promise to resolve with the inspector data
     */
    @Override
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
    @Override
    public void stabilize(double requiredMatches, double minScreenshotsCount, double intervalMs, double timeoutMs, boolean saveScreenshots, double threshold, boolean includeAA, Promise promise) {
        Activity activity = getCurrentActivity();
        moduleCore.stabilize(activity, (int)requiredMatches, (int)minScreenshotsCount, (int)intervalMs, (int)timeoutMs, saveScreenshots, threshold, includeAA, promise);
    }
} 