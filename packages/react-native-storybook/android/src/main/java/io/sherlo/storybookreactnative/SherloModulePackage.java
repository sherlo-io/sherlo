package io.sherlo.storybookreactnative;

import androidx.annotation.Nullable;

import com.facebook.react.TurboReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.module.model.ReactModuleInfo;
import com.facebook.react.module.model.ReactModuleInfoProvider;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Package for SherloModule. This class gets registered in the app's MainApplication.
 */
public class SherloModulePackage extends TurboReactPackage {

    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }

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
            moduleInfos.put(SherloModule.NAME, new ReactModuleInfo(
                    SherloModule.NAME,
                    SherloModule.NAME,
                    /* canOverride */ false,
                    /* needsEagerInit */ true,
                    /* isCxxModule */ false,
                    /* isTurboModule */ true
            ));
            return moduleInfos;
        };
    }
}
