package io.sherlo.storybookreactnative;

import android.app.Activity;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.module.annotations.ReactModule;
import com.facebook.react.turbomodule.core.interfaces.TurboModule;

import java.util.Map;

/**
 * Turbo Native Module implementation of Sherlo.
 * Uses SherloModuleCore for the core implementation.
 * 
 * This implementation works with both:
 * - New architecture where codegen successfully generates the spec
 * - New architecture where codegen fails but TurboModule interface is supported
 */
@ReactModule(name = SherloModule.NAME)
public class SherloModule extends TurboModuleBase implements NativeSherloModuleSpec {
    private final SherloModuleCore moduleCore;
    private final ReactApplicationContext reactContext;
    
    public static final String NAME = "SherloModuleSpec";

    SherloModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
        this.moduleCore = new SherloModuleCore(context);
    }

    @Override
    @NonNull
    public String getName() {
        return NAME;
    }
    
    @Override
    @Nullable
    public Map<String, Object> getConstants() {
        return moduleCore.getConstants();
    }

    @Override
    public void toggleStorybook(Promise promise) {
        Activity activity = reactContext.getCurrentActivity();
        moduleCore.toggleStorybook(activity, promise);
    }

    @Override
    public void openStorybook(Promise promise) {
        Activity activity = reactContext.getCurrentActivity();
        moduleCore.openStorybook(activity, promise);
    }

    @Override
    public void closeStorybook(Promise promise) {
        Activity activity = reactContext.getCurrentActivity();
        moduleCore.closeStorybook(activity, promise);
    }

    @Override
    public void appendFile(String filename, String base64Content, Promise promise) {
        moduleCore.appendFile(filename, base64Content, promise);
    }

    @Override
    public void readFile(String filename, Promise promise) {
        moduleCore.readFile(filename, promise);
    }

    @Override
    public void getInspectorData(Promise promise) {
        Activity activity = reactContext.getCurrentActivity();
        moduleCore.getInspectorData(activity, promise);
    }

    @Override
    public void stabilize(double requiredMatches, double intervalMs, double timeoutMs, boolean saveScreenshots, Promise promise) {
        Activity activity = reactContext.getCurrentActivity();
        moduleCore.stabilize(activity, (int)requiredMatches, (int)intervalMs, (int)timeoutMs, saveScreenshots, promise);
    }
} 