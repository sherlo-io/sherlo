package io.sherlo.storybookreactnative;

import androidx.annotation.NonNull;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * This is the legacy Native Module implementation that will be used
 * when the New Architecture is not enabled.
 */
public class SherloTurboModule extends ReactContextBaseJavaModule {
    public static final String NAME = "SherloTurbo";

    public SherloTurboModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    @NonNull
    public String getName() {
        return NAME;
    }

    /**
     * Synchronous method that returns a greeting string
     * Using isBlockingSynchronousMethod=true for direct JavaScript return value
     */
    @ReactMethod(isBlockingSynchronousMethod = true)
    public String hello(String name) {
        return "Hello, " + name + " from Legacy Module!";
    }
} 