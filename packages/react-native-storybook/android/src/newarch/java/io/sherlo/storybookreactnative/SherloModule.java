package io.sherlo.storybookreactnative;

import android.app.Activity;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.Promise;
import com.facebook.react.module.annotations.ReactModule;
import com.facebook.react.turbomodule.core.interfaces.TurboModule;

import java.util.Map;

/**
 * Turbo Native Module implementation of Sherlo.
 * Uses SherloModuleCore for the core implementation.
 * 
 * This implementation works with the New Architecture as a TurboModule.
 * All required interfaces are implemented directly in this class.
 */
@ReactModule(name = SherloModule.NAME)
public class SherloModule implements NativeModule, TurboModule {
    private final SherloModuleCore moduleCore;
    private final ReactApplicationContext reactContext;
    
    public static final String NAME = "SherloModule";

    SherloModule(ReactApplicationContext context) {
        this.reactContext = context;
        this.moduleCore = new SherloModuleCore(context);
    }

    @Override
    public void initialize() {
        // Required by NativeModule
    }

    @Override
    public boolean canOverrideExistingModule() {
        return false;
    }

    @Override
    public void onCatalystInstanceDestroy() {
        // Required by NativeModule
    }
    
    @Override
    public void invalidate() {
        // Called when the module needs to be invalidated
        // This is typically required for cleanup in the new architecture
    }

    @Override
    @NonNull
    public String getName() {
        return NAME;
    }
    
    @Nullable
    public Map<String, Object> getConstants() {
        return moduleCore.getConstants();
    }

    public void toggleStorybook(Promise promise) {
        Activity activity = reactContext.getCurrentActivity();
        moduleCore.toggleStorybook(activity, promise);
    }

    public void openStorybook(Promise promise) {
        Activity activity = reactContext.getCurrentActivity();
        moduleCore.openStorybook(activity, promise);
    }

    public void closeStorybook(Promise promise) {
        Activity activity = reactContext.getCurrentActivity();
        moduleCore.closeStorybook(activity, promise);
    }

    public void appendFile(String filename, String base64Content, Promise promise) {
        moduleCore.appendFile(filename, base64Content, promise);
    }

    public void readFile(String filename, Promise promise) {
        moduleCore.readFile(filename, promise);
    }

    public void getInspectorData(Promise promise) {
        Activity activity = reactContext.getCurrentActivity();
        moduleCore.getInspectorData(activity, promise);
    }

    public void stabilize(double requiredMatches, double intervalMs, double timeoutMs, boolean saveScreenshots, Promise promise) {
        Activity activity = reactContext.getCurrentActivity();
        moduleCore.stabilize(activity, (int)requiredMatches, (int)intervalMs, (int)timeoutMs, saveScreenshots, promise);
    }
} 