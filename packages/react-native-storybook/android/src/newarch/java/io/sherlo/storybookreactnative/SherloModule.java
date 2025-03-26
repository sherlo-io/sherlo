package io.sherlo.storybookreactnative;

import android.app.Activity;

import androidx.annotation.NonNull;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.Promise;

import java.util.Map;

/**
 * Turbo Native Module implementation of Sherlo.
 * Uses SherloModuleCore for the core implementation.
 */
public class SherloModule extends NativeSherloModuleSpec {
    private final SherloModuleCore moduleCore;
    
    public static final String NAME = "SherloModule";

    SherloModule(ReactApplicationContext context) {
        super(context);
        this.moduleCore = new SherloModuleCore(context);
    }

    @Override
    @NonNull
    public String getName() {
        return NAME;
    }
    
    @Override
    public Map<String, Object> getConstants() {
        return moduleCore.getConstants();
    }

    @Override
    public void toggleStorybook(Promise promise) {
        Activity activity = getCurrentActivity();
        moduleCore.toggleStorybook(activity, promise);
    }

    @Override
    public void openStorybook(Promise promise) {
        Activity activity = getCurrentActivity();
        moduleCore.openStorybook(activity, promise);
    }

    @Override
    public void closeStorybook(Promise promise) {
        Activity activity = getCurrentActivity();
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
        Activity activity = getCurrentActivity();
        moduleCore.getInspectorData(activity, promise);
    }

    @Override
    public void stabilize(double requiredMatches, double intervalMs, double timeoutMs, Promise promise) {
        Activity activity = getCurrentActivity();
        moduleCore.stabilize(activity, (int)requiredMatches, (int)intervalMs, (int)timeoutMs, promise);
    }
} 