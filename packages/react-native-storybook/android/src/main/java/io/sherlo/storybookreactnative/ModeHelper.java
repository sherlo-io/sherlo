package io.sherlo.storybookreactnative;

import android.app.Activity;
import android.util.Log;

/**
 * Helper class for managing Sherlo mode (default, storybook, testing, verification).
 * Handles mode state and transitions.
 */
public class ModeHelper {
    public static final String TAG = "ModeHelper";

    // Available modes
    public static final String MODE_DEFAULT = "default";
    public static final String MODE_STORYBOOK = "storybook";
    public static final String MODE_TESTING = "testing";
    public static final String MODE_VERIFICATION = "verification";

    private static String currentMode = MODE_DEFAULT;

    /**
     * Get the current application mode.
     * 
     * @return The current mode
     */
    public static String getCurrentMode() {
        return currentMode;
    }

    /**
     * Set the current application mode.
     * 
     * @param mode The new mode
     */
    public static void setMode(String mode) {
        Log.i(TAG, "Changing mode to: " + mode);
        currentMode = mode;
    }

    /**
     * Check if the current mode is default.
     * 
     * @return true if in default mode
     */
    public static boolean isDefaultMode() {
        return MODE_DEFAULT.equals(currentMode);
    }

    /**
     * Check if the current mode is storybook.
     * 
     * @return true if in storybook mode
     */
    public static boolean isStorybookMode() {
        return MODE_STORYBOOK.equals(currentMode);
    }

    /**
     * Check if the current mode is testing.
     * 
     * @return true if in testing mode
     */
    public static boolean isTestingMode() {
        return MODE_TESTING.equals(currentMode);
    }

    /**
     * Check if the current mode is verification.
     * 
     * @return true if in verification mode
     */
    public static boolean isVerificationMode() {
        return MODE_VERIFICATION.equals(currentMode);
    }

    /**
     * Switch to default mode and reload the application.
     * 
     * @param activity The current activity
     */
    public static void switchToDefaultMode(Activity activity) {
        setMode(MODE_DEFAULT);
        RestartHelper.loadBundle(activity);
    }

    /**
     * Switch to storybook mode and reload the application.
     * 
     * @param activity The current activity
     */
    public static void switchToStorybookMode(Activity activity) {
        setMode(MODE_STORYBOOK);
        RestartHelper.loadBundle(activity);
    }

    /**
     * Switch to testing mode and reload the application.
     * 
     * @param activity The current activity
     */
    public static void switchToTestingMode(Activity activity) {
        setMode(MODE_TESTING);
        RestartHelper.loadBundle(activity);
    }

    /**
     * Switch to verification mode and reload the application.
     * 
     * @param activity The current activity
     */
    public static void switchToVerificationMode(Activity activity) {
        setMode(MODE_VERIFICATION);
        RestartHelper.loadBundle(activity);
    }
} 