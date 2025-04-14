package io.sherlo.storybookreactnative;

import androidx.annotation.NonNull;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.turbomodule.core.interfaces.TurboModule;

/**
 * Base class for TurboModule implementations.
 * This class provides the basic functionality required for TurboModules.
 */
public abstract class TurboModuleBase implements NativeModule, TurboModule {
    private final ReactApplicationContext reactContext;

    TurboModuleBase(ReactApplicationContext reactContext) {
        this.reactContext = reactContext;
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

    @NonNull
    protected ReactApplicationContext getReactApplicationContext() {
        return reactContext;
    }
} 