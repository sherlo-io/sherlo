package io.sherlo.storybookreactnative;

import android.app.Activity;
import android.app.Application;
import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;

import org.json.JSONObject;

/**
 * Lifecycle-only ContentProvider that triggers Sherlo's native early-init emission
 * before Application.onCreate() (and therefore before the React Native bridge and JS
 * evaluation). This mirrors the iOS __attribute__((constructor)) behavior and ensures
 * NATIVE_INIT_STARTED / NATIVE_LOADED reach protocol.sherlo even when JS crashes at
 * the top of the bundle - otherwise the TurboModule (lazy, needsEagerInit=false) is
 * never instantiated and the runner misclassifies a JS launch crash as an EAS update
 * launch failure.
 *
 * Also registers an ActivityLifecycleCallbacks (in testing mode only) that emits
 * NATIVE_INIT_COMPLETE after the first Activity's onCreate returns successfully.
 * A crash inside MainActivity.onCreate prevents the callback from firing, so the
 * signal is absent for native-init crashes and present for JS-eval crashes.
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
                registerNativeInitCompleteCallback(ctx);
            }
        } catch (Throwable t) {
            // Never let a provider crash take down app startup for every SDK user.
            Log.e(TAG, "SherloInitProvider.onCreate failed", t);
        }
        return true;
    }

    /**
     * Registers an ActivityLifecycleCallbacks that emits NATIVE_INIT_COMPLETE after the
     * first Activity's onCreate returns. Only registered in testing mode - production apps
     * must not pay for an unused listener. onActivityCreated is the earliest callback
     * guaranteed to fire only if MainActivity.onCreate succeeded; a crash in onCreate
     * (before or after super.onCreate) prevents the callback from ever being invoked.
     */
    private void registerNativeInitCompleteCallback(Context ctx) {
        Context appCtx = ctx.getApplicationContext();
        if (!(appCtx instanceof Application)) return;

        try {
            FileSystemHelper fsHelper = new FileSystemHelper(appCtx);
            JSONObject cfg = ConfigHelper.loadConfig(fsHelper);
            if (cfg == null) return;

            String mode = ConfigHelper.determineModeFromConfig(cfg);
            if (!SherloModuleCore.MODE_TESTING.equals(mode)) return;

            Application app = (Application) appCtx;
            app.registerActivityLifecycleCallbacks(new Application.ActivityLifecycleCallbacks() {
                @Override
                public void onActivityCreated(Activity activity, Bundle savedInstanceState) {
                    SherloModuleCore.performNativeInitComplete(appCtx);
                    app.unregisterActivityLifecycleCallbacks(this);
                }

                @Override public void onActivityStarted(Activity activity) {}
                @Override public void onActivityResumed(Activity activity) {}
                @Override public void onActivityPaused(Activity activity) {}
                @Override public void onActivityStopped(Activity activity) {}
                @Override public void onActivitySaveInstanceState(Activity activity, Bundle outState) {}
                @Override public void onActivityDestroyed(Activity activity) {}
            });
        } catch (Throwable t) {
            Log.e(TAG, "Failed to register ActivityLifecycleCallbacks", t);
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
