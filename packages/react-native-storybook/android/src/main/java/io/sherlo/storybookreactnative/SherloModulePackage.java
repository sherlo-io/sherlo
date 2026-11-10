package io.sherlo.storybookreactnative;

import androidx.annotation.Nullable;

import com.facebook.react.TurboReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.module.model.ReactModuleInfo;
import com.facebook.react.module.model.ReactModuleInfoProvider;

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
     * so its constructor - and therefore rememberReactContext() / performEarlyInit() - runs
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

    /**
     * The 6-arg ReactModuleInfo constructor exists on every React Native this SDK supports
     * (>= 0.81), so it is called directly. A reflective lookup is not used: R8 in a minified
     * release build strips constructors nothing calls directly, and the lookup then fails at
     * app start.
     */
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
                    /* isTurboModule */ BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
            ));
            return moduleInfos;
        };
    }
}
