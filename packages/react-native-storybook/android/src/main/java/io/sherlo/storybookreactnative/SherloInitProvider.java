package io.sherlo.storybookreactnative;

import android.app.Activity;
import android.app.Application;
import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.facebook.react.bridge.JSExceptionHandler;
import com.facebook.react.bridge.ReactMarker;
import com.facebook.react.bridge.ReactMarkerConstants;

import java.io.IOException;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Lifecycle-only ContentProvider that starts Sherlo's native side before Application.onCreate()
 * (and therefore before the React Native bridge and JS evaluation). This mirrors the iOS
 * __attribute__((constructor)) behavior.
 *
 * It reads the address the runner handed at launch from the first activity's intent, before that
 * activity's JavaScript starts: an address puts the app in testing mode and opens the connection,
 * so NATIVE_INIT_STARTED / NATIVE_LOADED reach the runner even when JS crashes at the top of the
 * bundle. With no address the app opens nothing and runs as built.
 *
 * Manifest merger auto-registers this provider in any host app that installs the SDK;
 * no changes needed in the host app.
 */
public class SherloInitProvider extends ContentProvider {
    private static final String TAG = "SherloModule:InitProvider";

    /** The launch intent's extra that carries the connection's address (`--es sherloAddress <url>`). */
    private static final String ADDRESS_EXTRA = "sherloAddress";

    /**
     * The launch intent's extra that starts a debug build in testing mode for `sherlo capture`
     * (`--es sherloCapture <storyId>`), so no boot of the app runs before the capture.
     */
    private static final String CAPTURE_EXTRA = "sherloCapture";

    /** The launch intent's boolean extra that has the capture discover (--ez sherloDiscover true). */
    private static final String DISCOVER_EXTRA = "sherloDiscover";

    // Native watchdog timer: fires if getStorybook() is never called within 30s of launch.
    private static final AtomicBoolean getStorybookCalled = new AtomicBoolean(false);
    private static Handler timerHandler;
    private static Runnable timerRunnable;

    @Override
    public boolean onCreate() {
        try {
            Context ctx = getContext();
            if (ctx != null) {
                SherloModuleCore.performEarlyInit(ctx);
                if (SherloModuleCore.MODE_TESTING.equals(SherloModuleCore.getCurrentMode())) {
                    startTestingWatch(ctx);
                } else {
                    readAddressFromTheFirstActivity(ctx);
                }
            }
            installJsExceptionHandler();
            installJsBundleEvalHook();
            // Before Application.onCreate, so before any client is made.
            if (ctx != null) SherloRequestAnswers.installWhereARunCanFollow(ctx, null);
        } catch (Throwable t) {
            // Never let a provider crash take down app startup for every SDK user.
            Log.e(TAG, "SherloInitProvider.onCreate failed", t);
        }
        return true;
    }

    /**
     * Reads the launch intent's address as the process's first activity is made: before it is
     * created on Android 10 and later, as it is created before that - either way before the
     * activity starts its JavaScript.
     */
    private void readAddressFromTheFirstActivity(final Context ctx) {
        Context appContext = ctx.getApplicationContext();
        if (!(appContext instanceof Application)) return;
        final Application application = (Application) appContext;

        application.registerActivityLifecycleCallbacks(new Application.ActivityLifecycleCallbacks() {
            private boolean addressRead = false;

            @Override
            public void onActivityPreCreated(Activity activity, Bundle savedInstanceState) {
                readAddressOnce(activity);
            }

            @Override
            public void onActivityCreated(Activity activity, Bundle savedInstanceState) {
                // Below Android 10 there is no pre-created callback.
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                    readAddressOnce(activity);
                }
            }

            private void readAddressOnce(Activity activity) {
                if (addressRead) return;
                addressRead = true;
                application.unregisterActivityLifecycleCallbacks(this);
                try {
                    Intent intent = activity.getIntent();
                    String address = intent != null ? intent.getStringExtra(ADDRESS_EXTRA) : null;
                    String captureId = intent != null && intent.hasExtra(CAPTURE_EXTRA)
                            ? intent.getStringExtra(CAPTURE_EXTRA) : null;
                    SherloModuleCore.setDiscover(
                            intent != null && intent.getBooleanExtra(DISCOVER_EXTRA, false));
                    SherloModuleCore.startFromAddressHandedAtLaunch(address, captureId);
                    SherloRequestAnswers.installWhereARunCanFollow(ctx, address);
                    if (SherloModuleCore.MODE_TESTING.equals(SherloModuleCore.getCurrentMode())) {
                        startTestingWatch(ctx);
                    } else if (intent != null && intent.hasExtra(CAPTURE_EXTRA)) {
                        SherloModuleCore.startFromCaptureHandedAtLaunch(
                                ctx, intent.getStringExtra(CAPTURE_EXTRA));
                    }
                } catch (Throwable t) {
                    Log.e(TAG, "Failed to read the address handed at launch", t);
                }
            }

            @Override public void onActivityStarted(Activity activity) {}
            @Override public void onActivityResumed(Activity activity) {}
            @Override public void onActivityPaused(Activity activity) {}
            @Override public void onActivityStopped(Activity activity) {}
            @Override public void onActivitySaveInstanceState(Activity activity, Bundle outState) {}
            @Override public void onActivityDestroyed(Activity activity) {}
        });
    }

    /** What a run in testing mode watches for natively: a switched-off Storybook, and one that never appears. */
    private void startTestingWatch(Context ctx) {
        checkStorybookDisabledMarker(ctx);
        scheduleStorybookNotDisplayedTimer();
    }

    /**
     * Schedules a 30s native timer that sends ERROR_STORYBOOK_NOT_DISPLAYED if
     * getStorybook() is never called. Only active in testing mode; no-op otherwise.
     * The cancel signal arrives via notifyGetStorybookCalled() on the native module.
     */
    private void scheduleStorybookNotDisplayedTimer() {
        try {
            if (!SherloModuleCore.MODE_TESTING.equals(SherloModuleCore.getCurrentMode())) return;
            timerHandler = new Handler(Looper.getMainLooper());
            timerRunnable = () -> {
                if (!getStorybookCalled.get()) {
                    SherloModuleCore.sendNativeErrorMessage(
                        "ERROR_STORYBOOK_NOT_DISPLAYED",
                        "Storybook did not appear within 30s of app launch",
                        null);
                    Log.i(TAG, "ERROR_STORYBOOK_NOT_DISPLAYED sent by native timer");
                }
            };
            timerHandler.postDelayed(timerRunnable, 30000);
            Log.i(TAG, "storybookNotDisplayed native timer scheduled (30s)");
        } catch (Throwable t) {
            Log.e(TAG, "scheduleStorybookNotDisplayedTimer failed", t);
        }
    }

    /** Called from SherloModule.notifyGetStorybookCalled() to mark getStorybook() was invoked. */
    public static void setGetStorybookCalled() {
        getStorybookCalled.set(true);
    }

    /** Cancels the pending NOT_DISPLAYED timer. Safe to call even if timer already fired. */
    public static void cancelStorybookNotDisplayedTimer() {
        if (timerHandler != null && timerRunnable != null) {
            timerHandler.removeCallbacks(timerRunnable);
        }
    }

    /**
     * Checks for the build-time sherlo-storybook-disabled marker in the APK's assets.
     * If present AND in testing mode, sends ERROR_STORYBOOK_DISABLED over the connection.
     * Mode-gated: no-op in production (non-testing) mode.
     */
    private void checkStorybookDisabledMarker(Context ctx) {
        try {
            if (!SherloModuleCore.MODE_TESTING.equals(SherloModuleCore.getCurrentMode())) return;
            boolean markerExists = false;
            try {
                ctx.getAssets().open("sherlo-storybook-disabled").close();
                markerExists = true;
            } catch (IOException e) {
                // marker not present - not an error
            }
            if (markerExists) {
                SherloModuleCore.sendNativeErrorMessage(
                    "ERROR_STORYBOOK_DISABLED",
                    "Storybook is disabled in metro.config.js. Set enabled: true for Sherlo testing builds.",
                    null);
                Log.i(TAG, "ERROR_STORYBOOK_DISABLED sent: sherlo-storybook-disabled asset found");
            }
        } catch (Throwable t) {
            Log.e(TAG, "checkStorybookDisabledMarker failed", t);
        }
    }

    /**
     * Installs a process-wide uncaught-exception handler as a FALLBACK for bundle-eval crashes
     * on the React Native JS thread. The primary capture path is SherloJSExceptionCapture
     * (installed via wrapCatalystJsExceptionHandler at PRE_RUN_JS_BUNDLE_START), which sends
     * JS_ERROR with the original JS exception message before the JNI layer swallows it.
     *
     * This fallback only sends JS_ERROR if no JS_ERROR was sent yet (checked via
     * SherloModuleCore.isJsErrorCaptured()), so the secondary C++ exception ("Could not get
     * BatchedBridge") never stands in for the correct JS error message. It waits until the socket
     * took the error, at most two seconds, before the process is let go.
     */
    private void installJsExceptionHandler() {
        try {
            Thread.UncaughtExceptionHandler originalHandler = Thread.getDefaultUncaughtExceptionHandler();
            Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
                // Intercept the RN JS thread (old-arch uses "mqt_js", new-arch uses "js").
                if (("js".equals(thread.getName()) || "mqt_js".equals(thread.getName()))
                        && SherloModuleCore.MODE_TESTING.equals(SherloModuleCore.getCurrentMode())) {
                    try {
                        if (SherloModuleCore.isJsErrorCaptured()) {
                            Log.i(TAG, "JS_ERROR already sent via the primary path - skipping the fallback");
                        } else {
                            SherloModuleCore.sendJsErrorAndWait(
                                    throwable.getClass().getSimpleName(), bestMessage(throwable), stackOf(throwable));
                        }
                    } catch (Throwable sendErr) {
                        Log.e(TAG, "Sending the JS_ERROR failed", sendErr);
                    }
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
     * Returns the most informative message from the exception chain.
     * Prefers the top-level message (JavascriptException typically contains the full Hermes stack
     * including the original JS Error message). Falls back through causes if the top is empty.
     */
    private static String bestMessage(Throwable throwable) {
        Throwable current = throwable;
        while (current != null) {
            String message = current.getMessage();
            if (message != null && !message.isEmpty()) return message;
            current = current.getCause();
        }
        return throwable.toString();
    }

    private static String stackOf(Throwable throwable) {
        java.io.StringWriter stack = new java.io.StringWriter();
        throwable.printStackTrace(new java.io.PrintWriter(stack));
        return stack.toString();
    }

    /**
     * Registers a ReactMarker listener for PRE_RUN_JS_BUNDLE_START. In testing mode this fires
     * just before the JS bundle is evaluated. We use it to replace CatalystInstanceImpl's
     * mJSExceptionHandler with SherloJSExceptionCapture, which sends JS_ERROR with the original
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
                if (!SherloModuleCore.MODE_TESTING.equals(SherloModuleCore.getCurrentMode())) return;
                Log.i(TAG, "PRE_RUN_JS_BUNDLE_START: testing mode - wrapping CatalystInstance JS exception handler");
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
            com.facebook.react.bridge.ReactApplicationContext reactContext =
                    SherloModuleCore.currentReactContext();
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
            handlerField.set(ci, new SherloJSExceptionCapture());
            Log.i(TAG, "wrapCatalystJsHandler: mJSExceptionHandler replaced with SherloJSExceptionCapture");
        } catch (Throwable t) {
            Log.e(TAG, "wrapCatalystJsExceptionHandler failed", t);
        }
    }

    /**
     * Intercepts the original JS exception at CatalystInstanceImpl.mJSExceptionHandler before the
     * JNI rethrow swallows it and replaces it with the secondary "Could not get BatchedBridge"
     * C++ exception. Sends JS_ERROR over the connection with the correct message, waits until the
     * socket took it, then rethrows to preserve normal crash propagation behavior.
     *
     * <p>On old-arch Android the exception {@code e} typically has message
     * "Could not get BatchedBridge" rather than the original JS error - because Hermes
     * routes the throw through a different code path that loses the JS message before
     * it reaches Java.  The polyfill (metro/polyfill.js) writes
     * {@code global.__sherloLastJsError} before its bridge-call attempt, so we can
     * recover the real message by reading that global via JSI.
     * {@link SherloJsiReader#tryReadLastJsError} is called first; if it succeeds we
     * use the polyfill-captured fields; otherwise we fall back to the exception message.
     */
    private static class SherloJSExceptionCapture implements JSExceptionHandler {
        private static final String CAPTURE_TAG = "SherloModule:JsCapture";

        @Override
        public void handleException(Exception e) {
            try {
                // Try to recover the real JS error from the global written by the polyfill.
                // On old-arch Android, 'e' arrives with "Could not get BatchedBridge" instead
                // of the original JS error message.  The JSI read bypasses the broken bridge.
                SherloJsiReader.JsError jsError =
                        SherloJsiReader.tryReadLastJsError(SherloModuleCore.currentReactContext());
                if (jsError != null) {
                    Log.i(CAPTURE_TAG, "Recovered real JS error via JSI: " + jsError.message);
                    SherloModuleCore.sendJsErrorAndWait(jsError.name, jsError.message, jsError.stack);
                } else {
                    // Fallback: use whatever the bridge provided (may be secondary exception).
                    SherloModuleCore.sendJsErrorAndWait(e.getClass().getSimpleName(), bestMessage(e), stackOf(e));
                }
            } catch (Throwable sendErr) {
                Log.e(CAPTURE_TAG, "Failed to send JS_ERROR", sendErr);
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
