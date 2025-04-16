package io.sherlo.storybookreactnative;

import androidx.annotation.NonNull;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.Promise;

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
    public void hello(String name, Promise promise) {
        try {
            String result = "Hello, " + name + " from TurboModule!";
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("ERR_UNEXPECTED_EXCEPTION", e);
        }
    }
} 