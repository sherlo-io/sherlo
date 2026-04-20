package io.sherlo.storybookreactnative;

import androidx.annotation.Nullable;

import com.facebook.react.TurboReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.module.model.ReactModuleInfo;
import com.facebook.react.module.model.ReactModuleInfoProvider;

import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationTargetException;
import java.util.HashMap;
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
            final boolean isTurboModule = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED;

            ReactModuleInfo sherloInfo = makeInfo6(SherloModule.NAME, isTurboModule, false);
            if (sherloInfo == null) sherloInfo = makeInfo7(SherloModule.NAME, isTurboModule, false);
            moduleInfos.put(SherloModule.NAME, sherloInfo);

            return moduleInfos;
        };
    }

    /**
     * Try RN >= 0.74 6-arg constructor:
     * ReactModuleInfo(String, String, boolean canOverride, boolean needsEagerInit, boolean isCxx, boolean isTurbo)
     */
    private static ReactModuleInfo makeInfo6(String name, boolean isTurboModule, boolean canOverride) {
        try {
            Constructor<ReactModuleInfo> ctor = ReactModuleInfo.class.getConstructor(
                    String.class, String.class, boolean.class, boolean.class, boolean.class, boolean.class);

            return ctor.newInstance(
                    name,
                    name,
                    canOverride,
                    /* needsEagerInit */ false,
                    /* isCxxModule */ false,
                    /* isTurboModule */ isTurboModule
            );
        } catch (NoSuchMethodException e) {
            // RN < 0.74 - not available; signal caller to fall back.
            return null;
        } catch (IllegalAccessException | InstantiationException | InvocationTargetException e) {
            throw new RuntimeException("Failed to call 6-arg ReactModuleInfo constructor", e);
        }
    }

    /**
     * Fall back to legacy 7-arg constructor:
     * ReactModuleInfo(String, String, boolean canOverride, boolean needsEagerInit, boolean hasConstants, boolean isCxx, boolean isTurbo)
     * Present on RN <= 0.73, and deprecated-but-present on >= 0.74.
     */
    private static ReactModuleInfo makeInfo7(String name, boolean isTurboModule, boolean canOverride) {
        try {
            Constructor<ReactModuleInfo> ctor = ReactModuleInfo.class.getConstructor(
                    String.class, String.class, boolean.class, boolean.class, boolean.class, boolean.class, boolean.class);

            return ctor.newInstance(
                    name,
                    name,
                    canOverride,
                    /* needsEagerInit */ false,
                    /* hasConstants */ true,
                    /* isCxxModule */ false,
                    /* isTurboModule */ isTurboModule
            );
        } catch (NoSuchMethodException e) {
            throw new RuntimeException("7-arg ReactModuleInfo constructor not found on this RN version", e);
        } catch (IllegalAccessException | InstantiationException | InvocationTargetException e) {
            throw new RuntimeException("Failed to call 7-arg ReactModuleInfo constructor", e);
        }
    }
}
