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

    /**
     * Writes a JS_ERROR JSON line for bundle-eval crashes caught by the native exception handler.
     * Uses the top-level exception message (which contains the full Hermes JS stack trace), or
     * the root-cause message if the top-level one doesn't look like a useful JS error.
     */
    public static void writeJsErrorFromException(FileSystemHelper fileSystemHelper, Throwable t) {
        String name = t.getClass().getSimpleName();
        String message = bestMessage(t);
        String stack = stackToString(t);
        writeEarlyJsError(fileSystemHelper, name, message, stack);
    }

    /**
     * Returns the most informative message from the exception chain.
     * Prefers the top-level message (JavascriptException typically contains the full Hermes stack
     * including the original JS Error message). Falls back through causes if the top is empty.
     */
    private static String bestMessage(Throwable t) {
        // Walk the chain: collect all non-null messages, return the first non-blank one.
        Throwable cur = t;
        while (cur != null) {
            String msg = cur.getMessage();
            if (msg != null && !msg.isEmpty()) return msg;
            cur = cur.getCause();
        }
        return t.toString();
    }

    private static String stackToString(Throwable t) {
        java.io.StringWriter sw = new java.io.StringWriter();
        t.printStackTrace(new java.io.PrintWriter(sw));
        return sw.toString();
    }

    /**
     * Writes a JS_ERROR JSON line for module-eval errors (reportEarlyJsError).
     * Uses the full structured shape (name, message, stack, componentStack, digest, cause).
     */
    public static void writeEarlyJsError(FileSystemHelper fileSystemHelper, String name, String message, String stack) {
        JSONObject item = new JSONObject();
        try {
            item.put("timestamp", System.currentTimeMillis());
            item.put("entity", "app");
            item.put("action", "JS_ERROR");
            JSONObject data = new JSONObject();
            data.put("name", name != null ? name : "Error");
            data.put("message", message != null ? message : "");
            data.put("stack", stack != null ? stack : "");
            data.put("componentStack", new org.json.JSONArray());
            data.put("digest", JSONObject.NULL);
            data.put("cause", JSONObject.NULL);
            item.put("data", data);
            fileSystemHelper.appendFile("protocol.sherlo", item.toString() + "\n");
        } catch (org.json.JSONException e) {
            Log.e(TAG, "Error creating early JS_ERROR protocol item", e);
        }
    }
}
