package io.sherlo.storybookreactnative;

import androidx.annotation.Nullable;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.module.model.ReactModuleInfo;
import com.facebook.react.module.model.ReactModuleInfoProvider;
import com.facebook.react.TurboReactPackage;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Package for SherloTurbo module that works with both old and new architecture.
 * This class gets registered in the app's MainApplication.
 */
public class SherloTurboPackage extends TurboReactPackage {

    @Nullable
    @Override
    public NativeModule getModule(String name, ReactApplicationContext reactContext) {
        if (name.equals(SherloTurboModule.NAME)) {
            return new SherloTurboModule(reactContext);
        }
        return null;
    }

    @Override
    public ReactModuleInfoProvider getReactModuleInfoProvider() {
        return () -> {
            final Map<String, ReactModuleInfo> moduleInfos = new HashMap<>();
            
            moduleInfos.put(
                SherloTurboModule.NAME,
                new ReactModuleInfo(
                        SherloTurboModule.NAME,
                        SherloTurboModule.NAME,
                        false, // canOverrideExistingModule
                        false, // needsEagerInit
                        false, // isCxxModule
                        true // isTurboModule
                ));
            return moduleInfos;
        };
    }
} 