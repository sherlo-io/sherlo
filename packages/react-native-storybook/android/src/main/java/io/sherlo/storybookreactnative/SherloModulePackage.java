package io.sherlo.storybookreactnative;

import androidx.annotation.Nullable;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.module.model.ReactModuleInfo;
import com.facebook.react.module.model.ReactModuleInfoProvider;
import com.facebook.react.TurboReactPackage;
import io.sherlo.storybookreactnative.BuildConfig;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Package for SherloModule module that works with both old and new architecture.
 * This class gets registered in the app's MainApplication.
 */
public class SherloModulePackage extends TurboReactPackage {

    @Nullable
    @Override
    public NativeModule getModule(String name, ReactApplicationContext reactContext) {
        if (name.equals(SherloModule.NAME)) {
            return new SherloModule(reactContext);
        }
        return null;
    }

    @Override
    public ReactModuleInfoProvider getReactModuleInfoProvider() {
        return () -> {
            final Map<String, ReactModuleInfo> moduleInfos = new HashMap<>();

            boolean isTurboModule = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED;
            
            moduleInfos.put(
                SherloModule.NAME,
                new ReactModuleInfo(
                        SherloModule.NAME,
                        SherloModule.NAME,
                        false, // canOverrideExistingModule
                        false, // needsEagerInit
                        true, // hasConstants
                        false, // isCxxModule
                        isTurboModule
                ));
            return moduleInfos;
        };
    }
} 