package io.sherlo.storybookreactnative;

// Android Framework Imports
import android.app.Application;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;


// React Native Bridge Imports
import com.facebook.react.ReactInstanceManager;
import com.facebook.react.ReactNativeHost;
import com.facebook.react.ReactRootView;
import com.facebook.react.ReactApplication;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReactContext;

// Java Utility and IO Imports
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;

public class SherloModule extends ReactContextBaseJavaModule {
    public static final String TAG = "SherloModule";
    private static final String CONFIG_FILENAME = "config.sherlo";

    private final ReactApplicationContext reactContext;
    private static String syncDirectoryPath = "";
    private static String mode = "default"; // "default" / "storybook" / "testing"
    private static Boolean isStorybookRegistered = false;
    private static Class<?> mainActivityClass; 


    public SherloModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    
        try {
            // Set Sherlo directory path, this is the directory that will be 
            // used to sync files between the emulator and Sherlo Runner

            // https://developer.android.com/reference/android/content/Context#getExternalFilesDir(java.lang.String)
            File externalDirectory = this.getReactApplicationContext().getExternalFilesDir(null);
            if (externalDirectory != null) {
                this.syncDirectoryPath = externalDirectory.getAbsolutePath() + "/sherlo";
            } else {
                Log.e(TAG, "External storage is not accessible");
            }
    
            // This is the path to the config file created by the Sherlo Runner
            String configPath = this.syncDirectoryPath + "/" + CONFIG_FILENAME;
            
            // If the file exists, we are it testing mode and will open the 
            // Storybook in single activity mode, without launching the app
            Boolean doesSherloConfigFileExist = new File(configPath).isFile();
            if (doesSherloConfigFileExist) {
                this.mode = "testing";
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to initialize SherloModule", e);
            e.printStackTrace();
        }
    }

    @Override
    public String getName() {
        return "SherloModule";
    }

    @Override
    public Map<String, Object> getConstants() {
        final Map<String, Object> constants = new HashMap<>();

        constants.put("syncDirectoryPath", this.syncDirectoryPath);
        constants.put("mode", this.mode);

        return constants;
    }

    @ReactMethod
    public void storybookRegistered(Promise promise) {
        try {
            if(this.mode == "testing" && !this.isStorybookRegistered) {
                this.isStorybookRegistered = true;
                Log.i(TAG, "storybookRegistered");
                switchToComponent(SherloStorybookActivity.class, promise);
            }
            
            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("Error opening Storybook in testing mode", e.getMessage());
            Log.e(TAG, "Error opening Storybook in testing mode", e);
            e.printStackTrace();
        }
    }

    @ReactMethod
    public void toggleStorybook(Promise promise) {
        Log.i(TAG, "toggleStorybook, SherloStorybookActivity instance: " + SherloStorybookActivity.instance);
        try {
            // SherloStorybookActivity is a singleton, so we can check if it is open
            if (SherloStorybookActivity.instance != null) {
                closeStorybook(promise);
            } else {
                openStorybook(promise);
            }
        } catch (Exception e) {
            promise.reject("Error toggling Storybook", e.getMessage());
            Log.e(TAG, "Error toggling Storybook", e);
            e.printStackTrace();
        }
    }

    // Open Storybook and save original component
    @ReactMethod
    public void openStorybook(Promise promise) {
        Activity currentActivity = getCurrentActivity();
        if (currentActivity == null) {
            promise.reject("E_NO_ACTIVITY", "No current activity found");
            return;
        }

        if (mainActivityClass == null) {
            mainActivityClass = currentActivity.getClass();
        }

        Log.i(TAG, "openStorybook, mainActivityClass: " + mainActivityClass);
        switchToComponent(SherloStorybookActivity.class, promise);
        this.mode = "storybook";
    }



    // Close Storybook and return to the original component
    @ReactMethod
    public void closeStorybook(Promise promise) {
        Log.i(TAG, "closeStorybook, mainActivityClass: " + mainActivityClass);
        if (mainActivityClass != null) {
            switchToComponent(mainActivityClass, promise);
            mainActivityClass = null;
            this.mode = "default";
        } else {
            promise.reject("E_NO_ORIGINAL_COMPONENT", "No original component name saved");
        }
    }

    /**
     * Create a directory at the specified path
     */
    @ReactMethod
    public void mkdir(String filepath, Promise promise) {
        try {
            File file = new File(filepath);

            file.mkdirs();

            boolean exists = file.exists();

            if (!exists)
                throw new Exception("Directory could not be created");

            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("Error creating directory", e.getMessage());
            Log.e(TAG, "Error creating directory", e);
            e.printStackTrace();
        }
    }

    /**
     * Append a base64 encoded file to the specified path
     */
    @ReactMethod
    public void appendFile(String filepath, String base64Content, Promise promise) {
        try {
            byte[] bytes = Base64.decode(base64Content, Base64.DEFAULT);

            Uri uri = getFileUri(filepath);
            // Open the file in write and append mode
            OutputStream stream = reactContext.getContentResolver().openOutputStream(uri, "wa");

            stream.write(bytes);
            stream.close();

            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("Error appending file", e.getMessage());
            Log.e(TAG, "Error appending file", e);
            e.printStackTrace();
        }
    }

    /**
     * Read a byte array from the specified file and return it as a base64 string
     */
    @ReactMethod
    public void readFile(String filepath, Promise promise) {
        try {
            Uri uri = getFileUri(filepath);
            InputStream stream = reactContext.getContentResolver().openInputStream(uri);

            byte[] inputData = getInputStreamBytes(stream);
            String base64Content = Base64.encodeToString(inputData, Base64.NO_WRAP);

            promise.resolve(base64Content);
        } catch (Exception e) {
            promise.reject("Error reading file", e.getMessage());
            Log.e(TAG, "Error reading file", e);
            e.printStackTrace();
        }
    }

    private void switchToComponent(Class<?> activityClass, Promise promise) {
        Activity currentActivity = getCurrentActivity();
        if (currentActivity == null) {
            Log.e(TAG, "No current activity found");
            promise.reject("E_NO_ACTIVITY", "No current activity found");
            return;
        }
    
        Log.i(TAG, "switchToComponent");
    
        currentActivity.runOnUiThread(() -> {
            // Navigate to the StorybookSplash activity
            Intent intent = new Intent(currentActivity, StorybookSplashActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK | Intent.FLAG_ACTIVITY_NEW_TASK);
            intent.putExtra("activityClass", activityClass);
            intent.putExtra("mode", mode);
            currentActivity.startActivity(intent);
    
            Log.i(TAG, "Navigated to StorybookSplash activity");
            promise.resolve(null);
        });
    }
    

    private void switchToComponentOld(Class<?> activityClass, Promise promise) {
        Activity currentActivity = getCurrentActivity();
        if (currentActivity == null) {
            Log.e(TAG, "No current activity found");
            promise.reject("E_NO_ACTIVITY", "No current activity found");
            return;
        }

        Log.i(TAG, "switchToComponent, activityClass: " + activityClass);
        currentActivity.runOnUiThread(() -> {
            ReactInstanceManager manager = ((ReactApplication) currentActivity.getApplication()).getReactNativeHost().getReactInstanceManager();
            if (manager == null) {
                Log.e(TAG, "No ReactInstanceManager found");
                promise.reject("E_NO_REACT_INSTANCE_MANAGER", "No ReactInstanceManager found");
                return;
            }

            Log.i(TAG, "switchToComponent, currentActivity: " + currentActivity);

            // Finish the current activity
            currentActivity.finish();

            Log.i(TAG, "switchToComponent, currentActivity finished");

            // Add a listener to know when the React context has been fully recreated
            manager.addReactInstanceEventListener(new ReactInstanceManager.ReactInstanceEventListener() {
                @Override
                public void onReactContextInitialized(ReactContext context) {
                    // React context is fully reloaded
                    Log.i(TAG, "React context reloaded");

                    // Start the new activity
                    Intent intent = new Intent(reactContext, activityClass);
                    intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK | Intent.FLAG_ACTIVITY_NEW_TASK);
                    reactContext.startActivity(intent);

                    Log.i(TAG, "Activity started");

                    // Resolve the promise
                    promise.resolve(null);

                    // Remove listener to avoid memory leaks
                    manager.removeReactInstanceEventListener(this);

                    Log.i(TAG, "Listener removed");
                }
            });
            

            // Recreate the React context
            manager.recreateReactContextInBackground();

            Log.i(TAG, "React context recreated");
        });
    }
    
    /*
     * Get the URI for the specified absolute file path
     */
    private Uri getFileUri(String absoluteFilepath) throws Exception {
        Uri uri = Uri.parse(absoluteFilepath);
        File file = new File(absoluteFilepath);

        return Uri.parse("file://" + absoluteFilepath);
    }

    /*
     * Get the byte array from an input stream
     */
    private static byte[] getInputStreamBytes(InputStream inputStream) throws IOException {
        byte[] bytesResult;
        ByteArrayOutputStream byteBuffer = new ByteArrayOutputStream();
        int bufferSize = 1024;
        byte[] buffer = new byte[bufferSize];

        try {
            int len;

            while ((len = inputStream.read(buffer)) != -1) {
                byteBuffer.write(buffer, 0, len);
            }

            bytesResult = byteBuffer.toByteArray();
        } finally {
            try {
                byteBuffer.close();
            } catch (IOException e) {
                // We ignore this exception
                Log.e(TAG, "Error closing byteBuffer", e);
            }
        }

        return bytesResult;
    }
}