package io.sherlo.storybookreactnative;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.util.Log;

/**
 * Lifecycle-only ContentProvider that triggers Sherlo's pre-main config read
 * before Application.onCreate() (and therefore before the React Native bridge
 * and JS evaluation). This mirrors the iOS __attribute__((constructor))
 * behavior, so mode/config/lastState/nativeVersion are ready the instant JS
 * asks for them.
 *
 * Manifest merger auto-registers this provider in any host app that installs
 * the SDK; no changes needed in the host app. In production / non-testing
 * mode the provider is still instantiated by the OS but performs a silent
 * no-op.
 */
public class SherloInitProvider extends ContentProvider {
    private static final String TAG = "SherloModule:InitProvider";

    @Override
    public boolean onCreate() {
        try {
            Context ctx = getContext();
            if (ctx != null) {
                SherloModuleCore.performEarlyInit(ctx);
            }
        } catch (Throwable t) {
            // Never let a provider crash take down app startup for every SDK user.
            Log.e(TAG, "SherloInitProvider.onCreate failed", t);
        }
        return true;
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
