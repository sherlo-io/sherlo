package io.sherlo.storybookreactnative;

import androidx.annotation.Nullable;

import com.facebook.react.TurboReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.module.model.ReactModuleInfo;
import com.facebook.react.module.model.ReactModuleInfoProvider;

import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationTargetException;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Package for SherloModule module that works with both old and new architecture.
 * This class gets registered in the app's MainApplication.
 */
public class SherloModulePackage extends TurboReactPackage {

    /**
     * On old-arch, TurboReactPackage.getModule() is only called lazily (when JS requires the
     * module). We override createNativeModules() to force eager instantiation of SherloModule
     * so its constructor - and therefore storeEarlyReactContext() / performEarlyInit() - runs
     * during processPackages(), which happens BEFORE the JS bundle is evaluated.
     *
     * On new-arch (TurboModules) createNativeModules() is not used; we return empty so there
     * is no double-registration. getModule() / getReactModuleInfoProvider() handle that path.
     */
    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
        if (!BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
            return Arrays.asList(new SherloModule(reactContext));
        }
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
            final boolean isTurboModule = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED;

            ReactModuleInfo sherloInfo = makeInfo6(isTurboModule);
            if (sherloInfo == null) sherloInfo = makeInfo7(isTurboModule);
            moduleInfos.put(SherloModule.NAME, sherloInfo);

            return moduleInfos;
        };
    }

    /**
     * Try RN >= 0.74 6-arg constructor:
     * ReactModuleInfo(String, String, boolean canOverride, boolean needsEagerInit, boolean isCxx, boolean isTurbo)
     */
    private static ReactModuleInfo makeInfo6(boolean isTurboModule) {
        try {
            Constructor<ReactModuleInfo> ctor = ReactModuleInfo.class.getConstructor(
                    String.class, String.class, boolean.class, boolean.class, boolean.class, boolean.class);

            return ctor.newInstance(
                    SherloModule.NAME,
                    SherloModule.NAME,
                    /* canOverride */ false,
                    /* needsEagerInit */ true,
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
    private static ReactModuleInfo makeInfo7(boolean isTurboModule) {
        try {
            Constructor<ReactModuleInfo> ctor = ReactModuleInfo.class.getConstructor(
                    String.class, String.class, boolean.class, boolean.class, boolean.class, boolean.class, boolean.class);

            return ctor.newInstance(
                    SherloModule.NAME,
                    SherloModule.NAME,
                    /* canOverride */ false,
                    /* needsEagerInit */ true,
                    /* hasConstants */ true,
                    /* isCxxModule */ false,
                    /* isTurboModule */ isTurboModule
            );
        } catch (NoSuchMethodException e) {
            // Constructor exists but failed - escalate so the issue is visible
            throw new RuntimeException("7-arg ReactModuleInfo constructor not found on this RN version", e);
        } catch (IllegalAccessException | InstantiationException | InvocationTargetException e) {
            throw new RuntimeException("Failed to call 7-arg ReactModuleInfo constructor", e);
        }
    }
}
