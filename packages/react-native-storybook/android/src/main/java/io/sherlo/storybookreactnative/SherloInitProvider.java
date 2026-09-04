package io.sherlo.storybookreactnative;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.res.AssetManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import java.io.IOException;
import java.util.concurrent.atomic.AtomicBoolean;

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

    // Native watchdog timer: fires if getStorybook() is never called within 10s of launch.
    private static final AtomicBoolean getStorybookCalled = new AtomicBoolean(false);
    private static Handler timerHandler;
    private static Runnable timerRunnable;

    @Override
    public boolean onCreate() {
        try {
            Context ctx = getContext();
            if (ctx != null) {
                SherloModuleCore.performEarlyInit(ctx);
                checkStorybookDisabledMarker(ctx);
                scheduleStorybookNotDisplayedTimer();
            }
            installJsExceptionHandler();
        } catch (Throwable t) {
            // Never let a provider crash take down app startup for every SDK user.
            Log.e(TAG, "SherloInitProvider.onCreate failed", t);
        }
        return true;
    }

    /**
     * Schedules a 30s native timer that writes ERROR_STORYBOOK_NOT_DISPLAYED if
     * getStorybook() is never called. Only active in testing mode; no-op otherwise.
     * The cancel signal arrives via notifyGetStorybookCalled() on the native module.
     */
    private void scheduleStorybookNotDisplayedTimer() {
        try {
            if (!SherloModuleCore.MODE_TESTING.equals(SherloModuleCore.getCurrentMode())) return;
            FileSystemHelper fs = SherloModuleCore.getStaticFsHelper();
            if (fs == null) return;
            timerHandler = new Handler(Looper.getMainLooper());
            timerRunnable = () -> {
                if (!getStorybookCalled.get()) {
                    ProtocolHelper.writeNativeError(fs,
                        "ERROR_STORYBOOK_NOT_DISPLAYED",
                        "Storybook did not appear within 30s of app launch",
                        "");
                    Log.i(TAG, "ERROR_STORYBOOK_NOT_DISPLAYED written by native timer");
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
     * Installs a process-wide uncaught-exception handler that captures bundle-eval crashes
     * on the React Native JS thread as a fallback for whatever the JS-side capture (the Metro
     * polyfill's __d wrap calling reportEarlyJsError) did not already report - checked via
     * SherloModuleCore.isJsErrorCaptured() so this never overwrites the original JS message.
     */
    private void installJsExceptionHandler() {
        try {
            Thread.UncaughtExceptionHandler originalHandler = Thread.getDefaultUncaughtExceptionHandler();
            Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
                // Intercept the RN JS thread ("js" on new arch).
                if ("js".equals(thread.getName())
                        && SherloModuleCore.MODE_TESTING.equals(SherloModuleCore.getCurrentMode())
                        && !SherloModuleCore.isJsErrorCaptured()) {
                    try {
                        FileSystemHelper fs = SherloModuleCore.getStaticFsHelper();
                        if (fs != null) {
                            ProtocolHelper.writeJsErrorFromException(fs, throwable);
                        }
                    } catch (Throwable writeErr) {
                        Log.e(TAG, "writeJsErrorFromException failed", writeErr);
                    }
                }

                // Always chain to the original handler (crash reporters, system default).
                if (originalHandler != null) {
                    originalHandler.uncaughtException(thread, throwable);
                }
            });
        } catch (Throwable t) {
            Log.e(TAG, "installJsExceptionHandler failed", t);
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
