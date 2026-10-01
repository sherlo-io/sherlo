package io.sherlo.storybookreactnative;

import android.content.Context;
import android.util.Log;
import org.json.JSONObject;

/**
 * Helper class for reading sherlo.json from bundled assets.
 */
public class SherloJsonHelper {
    private static final String TAG = "SherloModule:SherloJsonHelper";

    /**
     * Returns the native version string from sherlo.json bundled assets, or null if missing/unreadable.
     *
     * @param context The Android context
     * @return The version string, or null if missing or unreadable
     */
    public static String getNativeVersion(Context context) {
        try {
            java.io.InputStream is = context.getAssets().open("sherlo.json");
            java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[1024];
            int len;
            while ((len = is.read(buf)) != -1) baos.write(buf, 0, len);
            JSONObject sherloJson = new JSONObject(baos.toString("UTF-8"));
            return sherloJson.optString("version", null);
        } catch (Exception e) {
            Log.w(TAG, "Could not read sherlo.json: " + e.getMessage());
            return null;
        }
    }
}
