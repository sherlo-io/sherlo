package io.sherlo.storybookreactnative;

import android.util.Base64;
import android.util.Log;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Helper class for loading and managing Sherlo configuration.
 * Provides methods to read and parse configuration from the filesystem.
 */
public class ConfigHelper {
    public static final String TAG = "SherloModule:ConfigHelper";
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
            return null;
        }

        String configJson = null;
        try {
            configJson = fileSystemHelper.readFile(CONFIG_FILENAME);
        } catch (Exception e) {
            Log.w(TAG, "Error reading config file: " + e.getMessage());
            return null;
        }

        if (configJson == null || configJson.trim().isEmpty()) {
            Log.w(TAG, "Config file is empty");
            return null;
        }

        // Try to decode if base64 encoded
        try {
            byte[] decodedBytes = Base64.decode(configJson, Base64.DEFAULT);
            configJson = new String(decodedBytes, "UTF-8");
        } catch (Exception e) {
            Log.w(TAG, "Config is not base64 encoded, trying to parse as plain JSON");
            return null;
        }

        // Parse JSON
        try {
            return new JSONObject(configJson);
        } catch (JSONException e) {
            Log.e(TAG, "Invalid JSON in config file: " + configJson);
            return null;
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
    public static String determineModeFromConfig(JSONObject config) {
        try {
            if (config.length() > 0) {
                // Check for override mode
                String overrideMode = config.getString("overrideMode");
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
} 