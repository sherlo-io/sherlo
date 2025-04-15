package io.sherlo.storybookreactnative;

import androidx.annotation.NonNull;
import com.facebook.react.bridge.ReactApplicationContext;

/**
 * This implementation works with the New Architecture as a TurboModule.
 * This class needs to match the JS spec in NativeSherloTurbo.ts
 * The actual generated interface will be created by codegen at build time.
 */
public class SherloTurboModule extends NativeSherloTurboSpec {
    public static final String NAME = "SherloTurbo";

    public SherloTurboModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    @NonNull
    public String getName() {
        return NAME;
    }

    @Override
    public String hello(String name) {
        return "Hello, " + name + " from TurboModule!";
    }
} 