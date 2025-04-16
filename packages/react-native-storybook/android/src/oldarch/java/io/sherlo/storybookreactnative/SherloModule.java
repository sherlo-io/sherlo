package io.sherlo.storybookreactnative;

import androidx.annotation.NonNull;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;

/**
 * This is the legacy Native Module implementation that will be used
 * when the New Architecture is not enabled.
 */
public class SherloModule extends ReactContextBaseJavaModule {
    public static final String NAME = "SherloModule";

    public SherloModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    @NonNull
    public String getName() {
        return NAME;
    }

    /**
     * Asynchronous method that returns a greeting string via Promise
     */
    @ReactMethod
    public void hello(String name, Promise promise) {
        try {
            String result = "Hello, " + name + " from Legacy Module!";
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("ERR_UNEXPECTED_EXCEPTION", e);
        }
    }
} 