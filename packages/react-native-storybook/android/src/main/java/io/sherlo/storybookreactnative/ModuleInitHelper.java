package io.sherlo.storybookreactnative;

import android.content.Context;
import android.util.Log;
import org.json.JSONObject;
import java.io.File;

/**
 * Helper class for initializing the Sherlo module.
 * Handles setup of directories, config loading, and mode determination.
 */
public class ModuleInitHelper {
    public static final String TAG = "ModuleInitHelper";

    /**
     * Initialize the Sherlo module.
     * 
     * @param context The React application context
     * @param fileSystemHelper The file system helper
     * @param errorHelper The error helper
     * @return InitResult containing the initialization results
     */
    public static InitResult initialize(Context context, FileSystemHelper fileSystemHelper, ErrorHelper errorHelper) {
        Log.i(TAG, "Initializing SherloModule");
        
        InitResult result = new InitResult();
        
        try {
            // Set Sherlo directory path
            File externalDirectory = context.getExternalFilesDir(null);
            if (externalDirectory == null) {
                errorHelper.handleError("ERROR_MODULE_INIT", "External storage is not accessible");
                return result;
            }
            
            result.syncDirectoryPath = externalDirectory.getAbsolutePath() + "/sherlo";
            
            // Create ConfigHelper
            ConfigHelper configHelper = new ConfigHelper(fileSystemHelper, result.syncDirectoryPath);
            
            // Load config
            result.config = configHelper.loadConfig();
            
            // Determine mode
            if (result.config.length() > 0) {
                // Check for override mode first
                String overrideMode = configHelper.getOverrideMode(result.config);
                if (overrideMode != null) {
                    Log.i(TAG, "Running in " + overrideMode + " mode");
                    result.mode = overrideMode;
                    return result;
                }
                
                result.mode = ModeHelper.MODE_TESTING;
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to initialize SherloModule", e);
            e.printStackTrace();
            errorHelper.handleException("ERROR_MODULE_INIT", e);
        }
        
        return result;
    }
    
    /**
     * Class to hold the results of initialization.
     */
    public static class InitResult {
        public String syncDirectoryPath = "";
        public String mode = ModeHelper.MODE_DEFAULT;
        public JSONObject config = new JSONObject();
    }
} 