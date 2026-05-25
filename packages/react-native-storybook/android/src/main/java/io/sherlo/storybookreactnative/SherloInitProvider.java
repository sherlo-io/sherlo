package io.sherlo.storybookreactnative;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.res.AssetManager;
import android.database.Cursor;
import android.net.Uri;
import android.util.Log;

import com.facebook.react.bridge.JSExceptionHandler;
import com.facebook.react.bridge.ReactMarker;
import com.facebook.react.bridge.ReactMarkerConstants;

import java.io.IOException;

/**
 * Lifecycle-only ContentProvider that triggers Sherlo's native early-init emission
 * before Application.onCreate() (and therefore before the React Native bridge and JS
 * evaluation). This mirrors the iOS __attribute__((constructor)) behavior and ensures
 * NATIVE_INIT_STARTED / NATIVE_LOADED reach protocol.sherlo even when JS crashes at
 * the top of the bundle.
 *
 * Manifest merger auto-registers this provider in any host app that installs the SDK;
 * no changes needed in the host app. In production / non-testing mode the provider is
 * still instantiated by the OS but performs a silent no-op.
 */
public class SherloInitProvider extends ContentProvider {
    private static final String TAG = "SherloModule:InitProvider";

    @Override
    public boolean onCreate() {
        try {
            Context ctx = getContext();
            if (ctx != null) {
                SherloModuleCore.performEarlyInit(ctx);
                checkStorybookDisabledMarker(ctx);
            }
            installJsExceptionHandler();
            installJsBundleEvalHook();
        } catch (Throwable t) {
            // Never let a provider crash take down app startup for every SDK user.
            Log.e(TAG, "SherloInitProvider.onCreate failed", t);
        }
        return true;
    }

    /**
     * Checks for the build-time sherlo-storybook-disabled marker in the APK's assets.
     * If present AND in testing mode, writes ERROR_STORYBOOK_DISABLED to protocol.sherlo.
     * The marker is written by applySherloTransforms.js when opts.enabled === false.
     * Mode-gated: no-op in production (non-testing) mode.
     */
    private void checkStorybookDisabledMarker(Context ctx) {
        try {
            if (!SherloModuleCore.MODE_TESTING.equals(SherloModuleCore.getCurrentMode())) return;
            FileSystemHelper fs = SherloModuleCore.getStaticFsHelper();
            if (fs == null) return;
            boolean markerExists = false;
            try {
                ctx.getAssets().open("sherlo-storybook-disabled").close();
                markerExists = true;
            } catch (IOException e) {
                // marker not present - not an error
            }
            if (markerExists) {
                ProtocolHelper.writeNativeError(fs,
                    "ERROR_STORYBOOK_DISABLED",
                    "Storybook is disabled in metro.config.js. Set enabled: true for Sherlo testing builds.",
                    "");
                Log.i(TAG, "ERROR_STORYBOOK_DISABLED written: sherlo-storybook-disabled asset found");
            }
        } catch (Throwable t) {
            Log.e(TAG, "checkStorybookDisabledMarker failed", t);
        }
    }

    /**
     * Installs a process-wide uncaught-exception handler as a FALLBACK for bundle-eval crashes
     * on the React Native JS thread. The primary capture path is SherloJSExceptionCapture
     * (installed via wrapCatalystJsExceptionHandler at PRE_RUN_JS_BUNDLE_START), which writes
     * JS_ERROR with the original JS exception message before the JNI layer swallows it.
     *
     * This fallback only writes JS_ERROR if SherloJSExceptionCapture did not already write it
     * (checked via SherloModuleCore.isJsErrorCaptured()), preventing the secondary C++ exception
     * ("Could not get BatchedBridge") from overwriting the correct JS error message.
     *
     * SPIKE: diagnostic logs intentionally verbose; will be trimmed after verification.
     */
    private void installJsExceptionHandler() {
        try {
            Thread.UncaughtExceptionHandler originalHandler = Thread.getDefaultUncaughtExceptionHandler();
            Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
                Log.i(TAG, "UncaughtException on thread: "
                        + thread.getName() + " | " + throwable);

                // Intercept the RN JS thread (old-arch uses "mqt_js", new-arch uses "js").
                if (("js".equals(thread.getName()) || "mqt_js".equals(thread.getName()))
                        && SherloModuleCore.MODE_TESTING.equals(SherloModuleCore.getCurrentMode())) {

                    Log.i(TAG, "handleException fired: "
                            + (throwable.getMessage() != null ? throwable.getMessage() : throwable.toString()));
                    try {
                        FileSystemHelper fs = SherloModuleCore.getStaticFsHelper();
                        if (SherloModuleCore.isJsErrorCaptured()) {
                            // Primary path (SherloJSExceptionCapture) already wrote the correct JS_ERROR.
                            Log.i(TAG, "JS_ERROR already captured via primary path - skipping fallback write");
                        } else if (fs != null) {
                            ProtocolHelper.writeJsErrorFromException(fs, throwable);
                            Log.i(TAG, "writeJsErrorFromException succeeded (fallback path)");
                        } else {
                            Log.w(TAG, "skipped: staticFsHelper is null (performEarlyInit not run?)");
                        }
                    } catch (Throwable writeErr) {
                        Log.e(TAG, "writeJsErrorFromException failed", writeErr);
                    }
                } else {
                    Log.i(TAG, "skipped: thread=" + thread.getName()
                            + " mode=" + SherloModuleCore.getCurrentMode());
                }

                // Always chain to the original handler (crash reporters, system default).
                if (originalHandler != null) {
                    originalHandler.uncaughtException(thread, throwable);
                }
            });
            Log.i(TAG, "SherloExceptionHandler installed");
        } catch (Throwable t) {
            Log.e(TAG, "installJsExceptionHandler failed", t);
        }
    }

    /**
     * Registers a ReactMarker listener for PRE_RUN_JS_BUNDLE_START. In testing mode this fires
     * just before the JS bundle is evaluated. We use it to replace CatalystInstanceImpl's
     * mJSExceptionHandler with SherloJSExceptionCapture, which writes JS_ERROR with the original
     * JS exception before rethrowing (preserving crash behavior). This intercepts BEFORE the JNI
     * layer swallows the original exception and replaces it with the secondary "Could not get
     * BatchedBridge" C++ exception.
     *
     * SherloModuleCore stores the ReactApplicationContext during processPackages() (which runs
     * before PRE_RUN_JS_BUNDLE_START), making getCatalystInstance() available here.
     */
    private void installJsBundleEvalHook() {
        try {
            ReactMarker.addListener((name, tag, instanceKey) -> {
                if (name != ReactMarkerConstants.PRE_RUN_JS_BUNDLE_START) return;
                if (!SherloModuleCore.MODE_TESTING.equals(SherloModuleCore.getCurrentMode())) {
                    Log.i(TAG, "PRE_RUN_JS_BUNDLE_START: not in testing mode, skipping");
                    return;
                }
                Log.i(TAG, "PRE_RUN_JS_BUNDLE_START: testing mode - wrapping CatalystInstance JS exception handler");
                // SPIKE diag: write PRE_RUN event to protocol
                FileSystemHelper preDiagFs = SherloModuleCore.getStaticFsHelper();
                if (preDiagFs != null) {
                    try {
                        org.json.JSONObject preDiag = new org.json.JSONObject();
                        preDiag.put("action", "DIAG_PRE_RUN_JS_BUNDLE_START");
                        preDiag.put("timestamp", System.currentTimeMillis());
                        preDiag.put("mode", SherloModuleCore.getCurrentMode());
                        preDiagFs.appendFile("protocol.sherlo", preDiag.toString() + "\n");
                    } catch (Throwable diagErr2) { /* ignore */ }
                }
                wrapCatalystJsExceptionHandler();
            });
            Log.i(TAG, "ReactMarker PRE_RUN_JS_BUNDLE_START listener installed");
        } catch (Throwable t) {
            Log.e(TAG, "installJsBundleEvalHook failed", t);
        }
    }

    /**
     * Replaces CatalystInstanceImpl.mJSExceptionHandler via reflection so that
     * SherloJSExceptionCapture intercepts the original JS exception before JNI loses it.
     *
     * Timing: processPackages() stores the ReactApplicationContext before catalystInstance is
     * created. By PRE_RUN_JS_BUNDLE_START, initializeWithInstance() has already been called, so
     * getCatalystInstance() returns the live CatalystInstanceImpl.
     */
    private void wrapCatalystJsExceptionHandler() {
        try {
            // Diagnostic: write DIAG entry to protocol.sherlo so we can trace execution
            // even without logcat. SPIKE: will be removed after verification.
            FileSystemHelper diagFs = SherloModuleCore.getStaticFsHelper();
            if (diagFs != null) {
                try {
                    org.json.JSONObject diag = new org.json.JSONObject();
                    diag.put("action", "DIAG_WRAP_CATALYST_CALLED");
                    diag.put("timestamp", System.currentTimeMillis());
                    diag.put("mode", SherloModuleCore.getCurrentMode());
                    diag.put("reactContextNull", SherloModuleCore.getEarlyReactContext() == null);
                    diagFs.appendFile("protocol.sherlo", diag.toString() + "\n");
                } catch (Throwable diagErr) { /* ignore */ }
            }

            com.facebook.react.bridge.ReactApplicationContext reactContext =
                    SherloModuleCore.getEarlyReactContext();
            if (reactContext == null) {
                Log.w(TAG, "wrapCatalystJsHandler: no stored ReactContext (SherloModuleCore not initialized?)");
                return;
            }

            com.facebook.react.bridge.CatalystInstance ci = reactContext.getCatalystInstance();

            // Find mJSExceptionHandler (typed as JSExceptionHandler interface) on CatalystInstanceImpl.
            java.lang.reflect.Field handlerField = null;
            for (Class<?> c = ci.getClass(); c != null && handlerField == null; c = c.getSuperclass()) {
                try { handlerField = c.getDeclaredField("mJSExceptionHandler"); }
                catch (NoSuchFieldException ignored) {}
            }
            if (handlerField == null) {
                Log.w(TAG, "wrapCatalystJsHandler: mJSExceptionHandler field not found");
                return;
            }
            handlerField.setAccessible(true);
            Object previousHandler = handlerField.get(ci);
            handlerField.set(ci, new SherloJSExceptionCapture());
            Object newHandler = handlerField.get(ci);
            // SPIKE diag: report whether set() actually changed the field value
            String prevClass = previousHandler != null ? previousHandler.getClass().getSimpleName() : "null";
            String newClass = newHandler != null ? newHandler.getClass().getSimpleName() : "null";
            boolean setWorked = newHandler instanceof SherloJSExceptionCapture;
            if (diagFs != null) {
                try {
                    org.json.JSONObject diagResult = new org.json.JSONObject();
                    diagResult.put("action", "DIAG_WRAP_CATALYST_RESULT");
                    diagResult.put("timestamp", System.currentTimeMillis());
                    diagResult.put("prevHandler", prevClass);
                    diagResult.put("newHandler", newClass);
                    diagResult.put("setWorked", setWorked);
                    diagFs.appendFile("protocol.sherlo", diagResult.toString() + "\n");
                } catch (Throwable diagErr3) { /* ignore */ }
            }
            Log.i(TAG, "wrapCatalystJsHandler: mJSExceptionHandler replaced with SherloJSExceptionCapture (setWorked=" + setWorked + ")");
        } catch (Throwable t) {
            Log.e(TAG, "wrapCatalystJsExceptionHandler failed", t);
        }
    }

    /**
     * Intercepts the original JS exception at CatalystInstanceImpl.mJSExceptionHandler before the
     * JNI rethrow swallows it and replaces it with the secondary "Could not get BatchedBridge"
     * C++ exception. Writes JS_ERROR to protocol.sherlo with the correct message, then rethrows
     * to preserve normal crash propagation behavior.
     */
    private static class SherloJSExceptionCapture implements JSExceptionHandler {
        private static final String CAPTURE_TAG = "SherloModule:JsCapture";

        @Override
        public void handleException(Exception e) {
            try {
                FileSystemHelper fs = SherloModuleCore.getStaticFsHelper();
                if (fs != null) {
                    ProtocolHelper.writeJsErrorFromException(fs, e);
                    SherloModuleCore.markJsErrorCaptured();
                    Log.i(CAPTURE_TAG, "Captured original JS error: "
                            + (e.getMessage() != null ? e.getMessage() : e.toString()));
                } else {
                    Log.w(CAPTURE_TAG, "staticFsHelper null - cannot write JS_ERROR");
                }
            } catch (Throwable writeErr) {
                Log.e(CAPTURE_TAG, "Failed to write JS_ERROR", writeErr);
            }
            // Rethrow to preserve normal crash behavior (JNI crash propagation).
            if (e instanceof RuntimeException) throw (RuntimeException) e;
            throw new RuntimeException(e);
        }
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        return null;
    }

    @Override
    public String getType(Uri uri) {
        return null;
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }
}
