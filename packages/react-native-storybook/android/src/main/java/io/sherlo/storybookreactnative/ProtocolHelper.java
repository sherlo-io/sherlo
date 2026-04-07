package io.sherlo.storybookreactnative;

import android.util.Log;
import org.json.JSONObject;

/**
 * Helper class for writing protocol.sherlo items.
 */
public class ProtocolHelper {
    private static final String TAG = "SherloModule:ProtocolHelper";

    /**
     * Writes a NATIVE_LOADED JSON line to protocol.sherlo.
     *
     * @param fileSystemHelper The file system helper
     * @param requestId The request ID (can be null)
     */
    public static void writeNativeLoaded(FileSystemHelper fileSystemHelper, String requestId) {
        JSONObject item = new JSONObject();
        try {
            item.put("action", "NATIVE_LOADED");
            if (requestId != null) {
                item.put("requestId", requestId);
            }
            item.put("timestamp", System.currentTimeMillis());
            item.put("entity", "app");
            fileSystemHelper.appendFile("protocol.sherlo", item.toString() + "\n");
        } catch (org.json.JSONException e) {
            Log.e(TAG, "Error creating NATIVE_LOADED protocol item", e);
        }
    }

    /**
     * Writes a NATIVE_ERROR JSON line to protocol.sherlo.
     *
     * @param fileSystemHelper The file system helper
     * @param errorCode The error code
     * @param message Human-readable error description
     */
    public static void writeNativeError(FileSystemHelper fileSystemHelper, String errorCode, String message) {
        JSONObject item = new JSONObject();
        try {
            item.put("action", "NATIVE_ERROR");
            item.put("errorCode", errorCode);
            item.put("message", message);
            item.put("timestamp", System.currentTimeMillis());
            item.put("entity", "app");
            fileSystemHelper.appendFile("protocol.sherlo", item.toString() + "\n");
        } catch (org.json.JSONException e) {
            Log.e(TAG, "Error creating NATIVE_ERROR protocol item", e);
        }
    }
}
