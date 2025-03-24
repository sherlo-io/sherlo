package io.sherlo.storybookreactnative;

import android.util.Base64;
import android.util.Log;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.File;

/**
 * Helper class for loading and managing Sherlo configuration.
 * Provides methods to read and parse configuration from the filesystem.
 */
public class ConfigHelper {
    public static final String TAG = "ConfigHelper";
    private static final String CONFIG_FILENAME = "config.sherlo";

    /**
     * Loads and parses the Sherlo configuration file.
     * Attempts to decode the file content as base64 before parsing as JSON.
     * Returns an empty JSONObject if the file doesn't exist or cannot be parsed.
     *
     * @param fileSystemHelper Helper class for file system operations
     * @return The parsed configuration as a JSONObject
     */
    public static JSONObject loadConfig(FileSystemHelper fileSystemHelper) {
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
     * Determines the initial application mode based on the configuration.
     * Checks for an override mode in the config first, otherwise defaults to testing mode 
     * if config exists, or default mode if there's no valid config.
     * 
     * @param config The configuration object
     * @return The determined mode (default, storybook, or testing)
     */
    public static String determineInitialMode(JSONObject config) {
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
     * Checks if the configuration specifies an override mode.
     * Reads the "overrideMode" property from the config object.
     * 
     * @param config The configuration object
     * @return The override mode value or null if not present/valid
     */
    private static String getOverrideMode(JSONObject config) {
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