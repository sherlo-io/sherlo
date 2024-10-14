package io.sherlo.storybookreactnative;

// Android Framework Imports
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import android.util.Log;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;
import android.view.View;
import android.view.ViewGroup;
import android.os.Environment;
import android.graphics.drawable.ColorDrawable;
import android.widget.TextView;

// React Native Bridge Imports
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.ReactInstanceManager;
import com.facebook.react.devsupport.interfaces.DevSupportManager;

// Java Utility and IO Imports
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.FileOutputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.List;
import java.util.ArrayList;
import org.json.JSONObject;
import org.json.JSONArray;

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
        Log.d(TAG, "Setting Storybook as registered");
        try {
            if ("testing".equals(this.mode) && !this.isStorybookRegistered) {
                Activity currentActivity = getCurrentActivity();
                if (currentActivity == null) {
                    Log.e(TAG, "No current activity found");
                    promise.reject("E_NO_ACTIVITY", "No current activity found");
                    return;
                }

                if (mainActivityClass == null) {
                    mainActivityClass = currentActivity.getClass();
                    Log.d(TAG, "Saving original component name: " + mainActivityClass.getName());
                }

                Log.d(TAG, "Opening Storybook in testing mode");
                switchToComponent(SherloStorybookActivity.class, mainActivityClass, promise);
                this.isStorybookRegistered = true;
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
        Log.d(TAG, "Toggling Storybook");
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
        Log.d(TAG, "Opening Storybook");

        Activity currentActivity = getCurrentActivity();
        if (currentActivity == null) {
            Log.e(TAG, "No current activity found");
            promise.reject("E_NO_ACTIVITY", "No current activity found");
            return;
        }

        if (mainActivityClass == null) {
            mainActivityClass = currentActivity.getClass();
            Log.d(TAG, "Saving original component name: " + mainActivityClass.getName());
        }

        switchToComponent(SherloStorybookActivity.class, mainActivityClass, promise);
        this.mode = "storybook";
    }

    @ReactMethod
    public void closeStorybook(Promise promise) {
        if (mainActivityClass != null) {
            Log.d(TAG, "Switching back to original component");
            switchToComponent(mainActivityClass, SherloStorybookActivity.class, promise);
            mainActivityClass = null;
            this.mode = "default";
        } else {
            Log.e(TAG, "No original component name saved");
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

    @ReactMethod
    public void dumpBoundries(Promise promise) {
        Activity activity = getCurrentActivity();
        if (activity == null) {
            promise.reject("no_activity", "No current activity");
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                View rootView = activity.getWindow().getDecorView().getRootView();

                // List to hold all view information
                List<JSONObject> viewList = new ArrayList<>();

                // Traverse and collect view information
                collectViewInfo(rootView, viewList);

                // Create JSON array
                JSONArray jsonArray = new JSONArray(viewList);

                // Serialize JSON array to string
                String jsonString = jsonArray.toString();

                // Resolve the promise with the JSON string
                promise.resolve(jsonString);
            } catch (Exception e) {
                promise.reject("error", e.getMessage(), e);
            }
        });
    }

    private void reloadJSBundle(Promise promise) {
        if (reactInstanceManager != null) {
            DevSupportManager devSupportManager = reactInstanceManager.getDevSupportManager();
            if (devSupportManager != null) {
                getCurrentActivity().runOnUiThread(() -> {
                    devSupportManager.handleReloadJS();
                    promise.resolve(true);
                });
            } else {
                promise.reject("DEV_SUPPORT_MANAGER_NULL", "DevSupportManager is null");
            }
        } else {
            promise.reject("REACT_INSTANCE_MANAGER_NULL", "ReactInstanceManager is null");
        }
    }

    private void collectViewInfo(View view, List<JSONObject> viewList) throws Exception {
        JSONObject viewObject = new JSONObject();

        // Class name
        String className = view.getClass().getSimpleName();
        viewObject.put("className", className);

        // Check visibility
        Rect rect = new Rect();
        boolean isVisible = view.getGlobalVisibleRect(rect);
        viewObject.put("isVisible", isVisible);

        if (isVisible) {
            // Position on screen
            viewObject.put("x", rect.left);
            viewObject.put("y", rect.top);

            // Dimensions
            viewObject.put("width", rect.width());
            viewObject.put("height", rect.height());

            // Tag (optional)
            Object tag = view.getTag();
            if (tag != null) {
                viewObject.put("tag", tag.toString());
            }

            // Content Description (optional)
            CharSequence contentDescription = view.getContentDescription();
            if (contentDescription != null) {
                viewObject.put("contentDescription", contentDescription.toString());
            }

            // Background Color (optional)
            if (view.getBackground() instanceof ColorDrawable) {
                int color = ((ColorDrawable) view.getBackground()).getColor();
                String hexColor = String.format("#%06X", (0xFFFFFF & color));
                viewObject.put("backgroundColor", hexColor);
            }

            // Text and Font Size (for TextView and its subclasses)
            if (view instanceof TextView) {
                TextView textView = (TextView) view;
                CharSequence text = textView.getText();
                if (text != null) {
                    viewObject.put("text", text.toString());
                }
                viewObject.put("fontSize", textView.getTextSize());
            }
        }

        viewList.add(viewObject);

        // If the view is a ViewGroup, recurse
        if (view instanceof ViewGroup) {
            ViewGroup viewGroup = (ViewGroup) view;
            for (int i = 0; i < viewGroup.getChildCount(); i++) {
                collectViewInfo(viewGroup.getChildAt(i), viewList);
            }
        }
    }

    private void switchToComponent(Class<?> activityClassToTransition, Class<?> closingActivityClass, Promise promise) {
        Activity currentActivity = getCurrentActivity();
        if (currentActivity == null) {
            promise.reject("E_NO_ACTIVITY", "No current activity found");
            return;
        }

        currentActivity.runOnUiThread(() -> {
            Intent intent = new Intent(currentActivity, StorybookSplashActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK | Intent.FLAG_ACTIVITY_NEW_TASK);
            intent.putExtra("activityClassToTransition", activityClassToTransition);
            intent.putExtra("closingActivityClass", closingActivityClass);
            intent.putExtra("mode", mode);

            currentActivity.startActivity(intent);

            promise.resolve(null);
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