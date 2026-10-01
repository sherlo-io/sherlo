package io.sherlo.storybookreactnative;

import android.util.Log;

import com.facebook.react.bridge.CatalystInstance;
import com.facebook.react.bridge.JavaScriptContextHolder;
import com.facebook.react.bridge.ReactApplicationContext;

import org.json.JSONObject;

/**
 * Java bridge to the native libsherlo.so JNI helper that reads the
 * {@code global.__sherloLastJsError} property from the JSI Runtime.
 *
 * <p>This is used by {@code SherloJSExceptionCapture.handleException()} to
 * recover the original JS error message on old-arch Android, where the
 * CatalystInstance delivers a secondary "Could not get BatchedBridge" exception
 * instead of the original JS exception.
 *
 * <p>The polyfill ({@code metro/polyfill.js}) writes {@code __sherloLastJsError}
 * before its bridge-call attempt, so it is always available when the exception
 * handler fires - even when the bridge call itself fails.
 *
 * <p>Thread-safety: {@link #tryReadLastJsError} MUST be called on the JS thread
 * (mqt_js / js).  {@code SherloJSExceptionCapture.handleException} runs on that
 * thread, so the call site is correct.
 */
public final class SherloJsiReader {

    private static final String TAG = "SherloModule:JsiReader";

    /** Result holder returned by {@link #tryReadLastJsError}. */
    public static final class JsError {
        public final String name;
        public final String message;
        public final String stack;

        JsError(String name, String message, String stack) {
            this.name    = name    != null ? name    : "Error";
            this.message = message != null ? message : "";
            this.stack   = stack   != null ? stack   : "";
        }
    }

    // -----------------------------------------------------------------
    // Native library loading
    // -----------------------------------------------------------------

    private static volatile boolean sLibraryLoaded = false;

    static {
        try {
            System.loadLibrary("sherlo");
            sLibraryLoaded = true;
        } catch (UnsatisfiedLinkError e) {
            // Acceptable on host environments that don't package the .so (unit tests,
            // Robolectric, or simulator-only builds).  Every public method returns null.
            Log.w(TAG, "libsherlo.so not loaded; JSI reads disabled: " + e.getMessage());
        }
    }

    // -----------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------

    /**
     * Attempts to read {@code global.__sherloLastJsError} from the current JSI
     * Runtime and return its fields.
     *
     * <p>Returns {@code null} if:
     * <ul>
     *   <li>the native library failed to load,</li>
     *   <li>{@code reactContext} is null,</li>
     *   <li>the CatalystInstance or runtime pointer is unavailable, or</li>
     *   <li>the global property is absent or not an object.</li>
     * </ul>
     *
     * <p>All internal errors are caught and logged; this method never throws.
     *
     * @param reactContext The ReactApplicationContext stored by SherloModuleCore.
     * @return A {@link JsError} with name/message/stack, or {@code null}.
     */
    public static JsError tryReadLastJsError(ReactApplicationContext reactContext) {
        if (!sLibraryLoaded) return null;
        if (reactContext == null) return null;

        try {
            CatalystInstance ci = reactContext.getCatalystInstance();
            if (ci == null) return null;

            JavaScriptContextHolder holder = ci.getJavaScriptContextHolder();
            if (holder == null) return null;

            long runtimePtr;
            synchronized (holder) {
                runtimePtr = holder.get();
            }
            if (runtimePtr == 0L) return null;

            String json = nativeReadLastJsError(runtimePtr);
            if (json == null || json.isEmpty()) return null;

            JSONObject obj = new JSONObject(json);
            return new JsError(
                    obj.optString("name",    "Error"),
                    obj.optString("message", ""),
                    obj.optString("stack",   "")
            );
        } catch (Throwable t) {
            Log.w(TAG, "tryReadLastJsError failed: " + t.getMessage());
            return null;
        }
    }

    // -----------------------------------------------------------------
    // JNI declaration
    // -----------------------------------------------------------------

    /**
     * Reads {@code global.__sherloLastJsError} from the given JSI Runtime pointer
     * and returns a compact JSON string {@code {"name":"...","message":"...","stack":"..."}}
     * or {@code null} if the global is absent or any JSI call throws.
     *
     * <p>Implemented in {@code SherloJsiReader.cpp}.
     */
    private static native String nativeReadLastJsError(long runtimePtr);

    // Utility class; no instantiation.
    private SherloJsiReader() {}
}
