package io.sherlo.storybookreactnative;

import android.util.Log;
import org.json.JSONObject;

/**
 * Helper class for writing protocol.sherlo items.
 */
public class ProtocolHelper {
    private static final String TAG = "SherloModule:ProtocolHelper";

    /**
     * Writes a NATIVE_INIT_STARTED JSON line to protocol.sherlo.
     * Called unconditionally as the first action after FileSystemHelper is created,
     * so the runner can detect that the native constructor was entered.
     *
     * @param fileSystemHelper The file system helper
     */
    public static void writeNativeInitStarted(FileSystemHelper fileSystemHelper) {
        JSONObject item = new JSONObject();
        try {
            item.put("action", "NATIVE_INIT_STARTED");
            item.put("timestamp", System.currentTimeMillis());
            item.put("entity", "app");
            fileSystemHelper.appendFile("protocol.sherlo", item.toString() + "\n");
        } catch (org.json.JSONException e) {
            Log.e(TAG, "Error creating NATIVE_INIT_STARTED protocol item", e);
        }
    }

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
     * @param dataJson JSON string with additional data fields (e.g. jsVersion, nativeVersion), or null
     */
    public static void writeNativeError(FileSystemHelper fileSystemHelper, String errorCode, String message, String dataJson) {
        JSONObject item = new JSONObject();
        try {
            item.put("action", "NATIVE_ERROR");
            item.put("errorCode", errorCode);
            item.put("message", message);
            item.put("timestamp", System.currentTimeMillis());
            item.put("entity", "app");
            if (dataJson != null && !dataJson.isEmpty()) {
                item.put("data", new org.json.JSONObject(dataJson));
            }
            fileSystemHelper.appendFile("protocol.sherlo", item.toString() + "\n");
        } catch (org.json.JSONException e) {
            Log.e(TAG, "Error creating NATIVE_ERROR protocol item", e);
        }
    }
}
