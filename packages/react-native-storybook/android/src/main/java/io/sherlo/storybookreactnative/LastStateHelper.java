package io.sherlo.storybookreactnative;

import android.util.Log;
import org.json.JSONObject;
import org.json.JSONArray;
import android.util.Base64;

/**
 * Helper for extracting and processing state information from Sherlo protocol files.
 * Used to maintain continuity between test runs or application restarts.
 */
public class LastStateHelper {
    private static final String TAG = "LastStateHelper";
    private static final String PROTOCOL_FILENAME = "protocol.sherlo";
    
    /**
     * Reads the protocol file and extracts the last state information.
     * Processes the file to find the most recent relevant protocol entries and
     * constructs a state object with snapshot and request information.
     * 
     * @param fileSystemHelper The file system helper for reading the protocol file
     * @return JSONObject containing the extracted state information or an empty JSONObject if not found
     */
    public static JSONObject getLastState(FileSystemHelper fileSystemHelper) {
        try {
            String protocolContent = null;
            try {
                protocolContent = fileSystemHelper.readFile(PROTOCOL_FILENAME);
            } catch (Exception e) {
                Log.w(TAG, "Protocol file doesn't exist or is not readable: " + e.getMessage());
                return new JSONObject();
            }
            
            if (protocolContent == null || protocolContent.trim().isEmpty()) {
                Log.w(TAG, "Protocol file is empty");
                return new JSONObject();
            }

            // Try to decode if base64 encoded
            try {
                byte[] decodedBytes = Base64.decode(protocolContent, Base64.DEFAULT);
                protocolContent = new String(decodedBytes, "UTF-8");
            } catch (Exception e) {
                Log.w(TAG, "Protocol is not base64 encoded, trying to parse as plain JSON");
            }

            String[] responseLines = protocolContent.split("\n");
            JSONObject ackStart = null;
            JSONObject lastRequestSnapshot = null;
            JSONObject startItem = null;  // Variable to store START action

            // Iterate through all lines in reverse order
            for (int i = responseLines.length - 1; i >= 0; i--) {
                try {
                    String line = responseLines[i];
                    if (line == null || line.trim().isEmpty()) continue;

                    JSONObject responseItem = new JSONObject(line);
                    String action = responseItem.optString("action", "");

                    if ("ACK_START".equals(action) && ackStart == null) {
                        ackStart = responseItem;
                    } else if ("ACK_REQUEST_SNAPSHOT".equals(action) && lastRequestSnapshot == null) {
                        lastRequestSnapshot = responseItem;
                    } else if ("START".equals(action) && startItem == null) {
                        startItem = responseItem;
                    }

                    // If we found all items, we can stop searching
                    if (ackStart != null && lastRequestSnapshot != null && startItem != null) {
                        break;
                    }
                } catch (Exception e) {
                    // Ignore parse errors for invalid JSON lines
                    Log.w(TAG, "Error parsing protocol line: " + e.getMessage());
                    continue;
                }
            }

            JSONObject state = new JSONObject();
            if (ackStart != null) {
                JSONObject nextSnapshot;
                if (lastRequestSnapshot != null && lastRequestSnapshot.has("nextSnapshot")) {
                    nextSnapshot = lastRequestSnapshot.getJSONObject("nextSnapshot");
                } else if (ackStart.has("nextSnapshot")) {
                    nextSnapshot = ackStart.getJSONObject("nextSnapshot");
                } else {
                    nextSnapshot = new JSONObject();
                }

                state.put("nextSnapshot", nextSnapshot);

                String requestId = "";
                if (lastRequestSnapshot != null && lastRequestSnapshot.has("requestId")) {
                    requestId = lastRequestSnapshot.getString("requestId");
                } else if (ackStart.has("requestId")) {
                    requestId = ackStart.getString("requestId");
                }

                state.put("requestId", requestId);
            }

            return state;
        } catch (Exception e) {
            Log.e(TAG, "Error getting last state", e);
            return new JSONObject();
        }
    }
} 