package io.sherlo.storybookreactnative;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.WritableMap;

import java.lang.ref.WeakReference;

/**
 * THE SHIM. This is the code that ships inside a customer's app.
 *
 * getSherloConstants and setMode (reached through invokeSync) answer locally,
 * from the pre-main read SherloModuleCore already did. reportEarlyJsError,
 * appendFile, readFile, invoke and invokeSync forward to libsherloshim.so's
 * JNI layer, which pulls whatever implementation an LD_PRELOADed library
 * registered - see sherlo-shim-jni.cpp. This class also lends that
 * implementation two things it cannot get for itself: a way onto the main
 * thread, and the foreground Activity. An injected native library ships no
 * dex, so it cannot construct the Runnable every main-thread API demands.
 * Both are mechanism, not behaviour: this class does not know the name of a
 * single Sherlo capability beyond setMode.
 */
public class SherloModule extends NativeSherloModuleSpec {

    public static final String NAME = "SherloModule";
    private final SherloModuleCore moduleCore;

    static {
        System.loadLibrary("sherloshim");
    }

    private static WeakReference<ReactApplicationContext> hostContext;
    private static final Handler mainHandler = new Handler(Looper.getMainLooper());

    static native boolean nativeReportEarlyJsError(String name, String message, String stack);
    static native void nativeAppendFile(String path, String content, Object promise);
    static native void nativeReadFile(String path, Object promise);
    static native void nativeInvoke(String name, String argsJson, Object promise);
    static native String nativeInvokeSync(String name, String argsJson);
    static native void nativeRunUiTask(long fnPtr, long ctxPtr);

    public SherloModule(ReactApplicationContext reactContext) {
        super(reactContext);
        hostContext = new WeakReference<>(reactContext);
        this.moduleCore = new SherloModuleCore(reactContext);
    }

    @Override
    public String getName() {
        return NAME;
    }

    /** LENT SERVICE: the only door onto the app's main thread. */
    static void postToMainThread(long fnPtr, long ctxPtr) {
        mainHandler.post(() -> nativeRunUiTask(fnPtr, ctxPtr));
    }

    /** LENT SERVICE: the foreground Activity, or null if none is resumed. */
    static Activity currentActivity() {
        ReactApplicationContext ctx = hostContext != null ? hostContext.get() : null;
        return ctx != null ? ctx.getCurrentActivity() : null;
    }

    /**
     * Settling is routed back through Java because the implementation finishes
     * on whichever thread its work ended on, and a Promise is easier to settle
     * correctly from Java than from JNI.
     */
    static void resolvePromise(Object promise, String json) {
        if (promise instanceof Promise) {
            ((Promise) promise).resolve(json);
        }
    }

    static void rejectPromise(Object promise, String code, String message) {
        if (promise instanceof Promise) {
            ((Promise) promise).reject(code, message);
        }
    }

    /**
     * Answered entirely from the pre-main read - never forwarded. See
     * SherloModuleCore: "a late runtime reads those frozen values and never
     * re-derives them."
     */
    @Override
    public WritableMap getSherloConstants() {
        return moduleCore.getSherloConstants();
    }

    /** Must never throw: it runs when nothing else is guaranteed to work. */
    @Override
    public boolean reportEarlyJsError(String name, String message, String stack) {
        try {
            return nativeReportEarlyJsError(name, message, stack);
        } catch (Throwable t) {
            return false;
        }
    }

    @Override
    public void appendFile(String path, String base64Content, Promise promise) {
        nativeAppendFile(path, base64Content, promise);
    }

    @Override
    public void readFile(String path, Promise promise) {
        nativeReadFile(path, promise);
    }

    @Override
    public void invoke(String name, String argsJson, Promise promise) {
        nativeInvoke(name, argsJson, promise);
    }

    /**
     * The implementation wins when present, so a test run can behave
     * differently from a developer toggle. The builtin is the FALLBACK, not an
     * override - see SherloModuleCore.builtin().
     *
     * An implementation that does not know a name is not an error here - the
     * shim may still handle it. That is what lets a NEWER customer binary
     * work with an OLDER implementation.
     */
    @Override
    public String invokeSync(String name, String argsJson) {
        String fromImpl = nativeInvokeSync(name, argsJson);
        if (!fromImpl.contains("UNKNOWN_METHOD") && !fromImpl.contains("sherlo_no_implementation")) {
            return fromImpl;
        }
        String builtin = moduleCore.builtin(name, argsJson);
        return builtin != null ? builtin : fromImpl;
    }
}
