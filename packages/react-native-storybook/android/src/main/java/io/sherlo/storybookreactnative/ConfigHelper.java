package io.sherlo.storybookreactnative;

import android.util.Base64;
import android.util.Log;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.File;

/**
 * Helper class for loading and managing Sherlo configuration.
 */
public class ConfigHelper {
    public static final String TAG = "ConfigHelper";
    private static final String CONFIG_FILENAME = "config.sherlo";

    private final FileSystemHelper fileSystemHelper;

    public ConfigHelper(FileSystemHelper fileSystemHelper) {
        this.fileSystemHelper = fileSystemHelper;
    }

    /**
     * Load and parse the Sherlo configuration file.
     */
    public JSONObject loadConfig() {
        if (!fileSystemHelper.fileExists(CONFIG_FILENAME)) {
            Log.i(TAG, "Config file does not exist");
            return new JSONObject();
        }

        String configJson = null;
        try {
            configJson = fileSystemHelper.readFile(CONFIG_FILENAME);
        } catch (Exception e) {
            Log.w(TAG, "Error reading config file: " + e.getMessage());
            return new JSONObject();
        }

        if (configJson == null || configJson.trim().isEmpty()) {
            Log.w(TAG, "Config file is empty");
            return new JSONObject();
        }

        // Try to decode if base64 encoded
        try {
            byte[] decodedBytes = Base64.decode(configJson, Base64.DEFAULT);
            configJson = new String(decodedBytes, "UTF-8");
        } catch (Exception e) {
            Log.w(TAG, "Config is not base64 encoded, trying to parse as plain JSON");
            return new JSONObject();
        }

        // Parse JSON
        try {
            return new JSONObject(configJson);
        } catch (JSONException e) {
            Log.e(TAG, "Invalid JSON in config file: " + configJson);
            return new JSONObject();
        }
    }

    /**
     * Determines the initial mode based on configuration
     * 
     * @param config The config object
     * @return The determined mode (default, storybook, or testing)
     */
    public String determineInitialMode(JSONObject config) {
        try {
            if (config.length() > 0) {
                // Check for override mode
                String overrideMode = getOverrideMode(config);
                if (overrideMode != null) {
                    Log.i(TAG, "Running in " + overrideMode + " mode");
                    return overrideMode;
                }
                
                return SherloModuleCore.MODE_TESTING;
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to determine initial mode", e);
        }
        return SherloModuleCore.MODE_DEFAULT;
    }

    /**
     * Check if the config has an override mode specified.
     * 
     * @param config The config object
     * @return The override mode or null if not present
     */
    private String getOverrideMode(JSONObject config) {
        try {
            if (config.has("overrideMode")) {
                return config.getString("overrideMode");
            }
        } catch (JSONException e) {
            Log.e(TAG, "Error reading overrideMode: " + e.getMessage());
        }
        return null;
    }
} 