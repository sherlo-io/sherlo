package io.sherlo.storybookreactnative;

import android.util.Log;
import org.json.JSONObject;
import org.json.JSONArray;
import android.util.Base64;

/**
 * Helper class for extracting the last state information from protocol files.
 * Provides methods to read and parse the latest state for snapshot management.
 */
public class LastStateHelper {
    private static final String TAG = "LastStateHelper";
    private static final String PROTOCOL_FILENAME = "protocol.sherlo";
    
    private final FileSystemHelper fileSystemHelper;
    private final ErrorHelper errorHelper;
    private final String syncDirectoryPath;
    
    /**
     * Constructor for LastStateHelper
     * 
     * @param fileSystemHelper The file system helper for reading files
     * @param errorHelper The error helper for handling errors
     * @param syncDirectoryPath The path to the sync directory
     */
    public LastStateHelper(FileSystemHelper fileSystemHelper, ErrorHelper errorHelper, String syncDirectoryPath) {
        this.fileSystemHelper = fileSystemHelper;
        this.errorHelper = errorHelper;
        this.syncDirectoryPath = syncDirectoryPath;
    }
    
    /**
     * Reads the protocol file and extracts the last state information.
     * This includes the next snapshot index, filtered view IDs, and request ID.
     * 
     * @return JSONObject containing the state information or an empty JSONObject if not found
     */
    public JSONObject getLastState() {
        try {
            String protocolPath = this.syncDirectoryPath + "/" + PROTOCOL_FILENAME;
            Log.d(TAG, "Reading protocol file at: " + protocolPath);

            String protocolContent = null;
            try {
                protocolContent = fileSystemHelper.readFile(protocolPath);
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
                int nextSnapshotIndex;
                if (lastRequestSnapshot != null && lastRequestSnapshot.has("nextSnapshotIndex")) {
                    nextSnapshotIndex = lastRequestSnapshot.getInt("nextSnapshotIndex");
                } else if (ackStart.has("nextSnapshotIndex")) {
                    nextSnapshotIndex = ackStart.getInt("nextSnapshotIndex");
                } else {
                    nextSnapshotIndex = 0;
                }

                state.put("nextSnapshotIndex", nextSnapshotIndex);

                JSONObject nextSnapshot;
                if (lastRequestSnapshot != null && lastRequestSnapshot.has("nextSnapshot")) {
                    nextSnapshot = lastRequestSnapshot.getJSONObject("nextSnapshot");
                } else if (ackStart.has("nextSnapshot")) {
                    nextSnapshot = ackStart.getJSONObject("nextSnapshot");
                } else {
                    nextSnapshot = new JSONObject();
                }

                state.put("nextSnapshot", nextSnapshot);
                
                if (ackStart.has("filteredViewIds")) {
                    state.put("filteredViewIds", ackStart.getJSONArray("filteredViewIds"));
                } else {
                    state.put("filteredViewIds", new JSONArray());
                }

                String requestId = "";
                if (lastRequestSnapshot != null && lastRequestSnapshot.has("requestId")) {
                    requestId = lastRequestSnapshot.getString("requestId");
                } else if (ackStart.has("requestId")) {
                    requestId = ackStart.getString("requestId");
                }

                state.put("requestId", requestId);

                // Add snapshots from START action if available
                if (startItem != null && startItem.has("snapshots")) {
                    state.put("snapshots", startItem.getJSONArray("snapshots"));
                }
            }

            return state;
        } catch (Exception e) {
            Log.e(TAG, "Error getting last state", e);
            errorHelper.handleException("ERROR_LAST_STATE", e);
            return new JSONObject();
        }
    }
} 