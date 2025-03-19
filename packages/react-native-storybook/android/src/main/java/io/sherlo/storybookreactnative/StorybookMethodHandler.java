package io.sherlo.storybookreactnative;

import android.app.Activity;
import android.util.Log;
import com.facebook.react.bridge.Promise;

/**
 * Handles all Storybook-related method calls.
 * Encapsulates the logic for toggling, opening, and closing Storybook.
 */
public class StorybookMethodHandler {
    private static final String TAG = "StorybookMethodHandler";
    
    private final ErrorHelper errorHelper;
    
    /**
     * Creates a new StorybookMethodHandler.
     *
     * @param errorHelper Helper for error handling
     */
    public StorybookMethodHandler(ErrorHelper errorHelper) {
        this.errorHelper = errorHelper;
    }
    
    /**
     * Toggles between Storybook and default mode.
     *
     * @param activity The current activity
     * @param promise The promise to resolve or reject
     */
    public void toggleStorybook(Activity activity, Promise promise) {
        try {
            if (activity == null) {
                promise.reject("ACTIVITY_NOT_FOUND", "Activity was not found");
                return;
            }
            
            Log.d(TAG, "Toggling Storybook");
            if (ModeHelper.isStorybookMode()) {
                closeStorybook(activity, promise);
            } else {
                openStorybook(activity, promise);
            }
        } catch (Exception e) {
            errorHelper.handleException("ERROR_TOGGLE_STORYBOOK", e);
            promise.reject("error_toggle_storybook", "Error toggling Storybook", e);
        }
    }
    
    /**
     * Opens Storybook mode.
     *
     * @param activity The current activity
     * @param promise The promise to resolve or reject
     */
    public void openStorybook(Activity activity, Promise promise) {
        try {
            if (activity == null) {
                promise.reject("ACTIVITY_NOT_FOUND", "Activity was not found");
                return;
            }
            
            Log.d(TAG, "Opening Storybook");
            ModeHelper.switchToStorybookMode(activity);
            promise.resolve(true);
        } catch (Exception e) {
            errorHelper.handleException("ERROR_OPEN_STORYBOOK", e);
            promise.reject("error_open_storybook", "Error opening Storybook", e);
        }
    }
    
    /**
     * Closes Storybook and returns to default mode.
     *
     * @param activity The current activity
     * @param promise The promise to resolve or reject
     */
    public void closeStorybook(Activity activity, Promise promise) {
        try {
            if (activity == null) {
                promise.reject("ACTIVITY_NOT_FOUND", "Activity was not found");
                return;
            }
            
            Log.d(TAG, "Closing Storybook");
            ModeHelper.switchToDefaultMode(activity);
            promise.resolve(true);
        } catch (Exception e) {
            errorHelper.handleException("ERROR_CLOSE_STORYBOOK", e);
            promise.reject("error_close_storybook", "Error closing Storybook", e);
        }
    }
    
    /**
     * Verifies integration with Sherlo.
     *
     * @param activity The current activity
     * @param promise The promise to resolve or reject
     */
    public void verifyIntegration(Activity activity, Promise promise) {
        try {
            if (activity == null) {
                promise.reject("ACTIVITY_NOT_FOUND", "Activity was not found");
                return;
            }
            
            Log.d(TAG, "Verifying integration");
            ModeHelper.switchToVerificationMode(activity);
            promise.resolve(true);
        } catch (Exception e) {
            errorHelper.handleException("ERROR_VERIFY_INTEGRATION", e);
            promise.reject("error_verify_integration", "Error verifying integration", e);
        }
    }
} 