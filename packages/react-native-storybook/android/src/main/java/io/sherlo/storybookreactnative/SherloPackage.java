package io.sherlo.storybookreactnative;

import androidx.annotation.Nullable;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.module.model.ReactModuleInfo;
import com.facebook.react.module.model.ReactModuleInfoProvider;
import com.facebook.react.BaseReactPackage;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Package for registering and exposing the Sherlo module.
 * Handles compatibility with both old and new architectures.
 */
public class SherloPackage extends BaseReactPackage {

    @Nullable
    @Override
    public NativeModule getModule(String name, ReactApplicationContext reactContext) {
        if (name.equals(SherloModule.NAME)) {
            return new SherloModule(reactContext);
        } else {
            return null;
        }
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
                            false, // isCxxModule
                            isTurboModule // isTurboModule
                    )
            );
            return moduleInfos;
        };
    }
}
