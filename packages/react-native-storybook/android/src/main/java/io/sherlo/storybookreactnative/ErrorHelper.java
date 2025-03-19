package io.sherlo.storybookreactnative;

import android.util.Base64;
import android.util.Log;
import org.json.JSONObject;
import java.util.HashMap;
import java.util.Map;

/**
 * Helper class for handling and logging errors in the Sherlo module.
 * Centralizes error handling and protocol file writing.
 */
public class ErrorHelper {
    public static final String TAG = "ErrorHelper";
    private static final String PROTOCOL_FILENAME = "protocol.sherlo";

    private final FileSystemHelper fileSystemHelper;
    private final String syncDirectoryPath;

    public ErrorHelper(FileSystemHelper fileSystemHelper, String syncDirectoryPath) {
        this.fileSystemHelper = fileSystemHelper;
        this.syncDirectoryPath = syncDirectoryPath;
    }

    /**
     * Handles errors by logging them and writing to the protocol file.
     * 
     * @param errorCode The error code
     * @param errorMessage The error message
     */
    public void handleError(String errorCode, String errorMessage) {
        Log.e(TAG, "Error occurred: " + errorCode + ", Error: " + errorMessage);

        String protocolFilePath = this.syncDirectoryPath + "/" + PROTOCOL_FILENAME;

        // Create the new JSON object with the specified properties
        Map<String, Object> nativeErrorMap = new HashMap<>();
        nativeErrorMap.put("action", "NATIVE_ERROR");
        nativeErrorMap.put("errorCode", errorCode);
        nativeErrorMap.put("error", errorMessage);
        nativeErrorMap.put("timestamp", System.currentTimeMillis());
        nativeErrorMap.put("entity", "app");

        try {
            // Convert the map to JSON string
            String jsonString = new JSONObject(nativeErrorMap).toString();

            // Convert JSON string to base64
            String base64ErrorData = Base64.encodeToString(jsonString.getBytes("UTF-8"),
                    Base64.NO_WRAP);

            // Append the base64 encoded error data to the protocol file
            fileSystemHelper.appendFile(protocolFilePath, base64ErrorData);
        } catch (Exception e) {
            Log.e(TAG, "Error writing to error file: " + e.getMessage());
        }
    }

    /**
     * Handles an exception by extracting its message and passing it to handleError.
     * 
     * @param errorCode The error code
     * @param exception The exception to handle
     */
    public void handleException(String errorCode, Exception exception) {
        handleError(errorCode, exception.getMessage());
    }
} 