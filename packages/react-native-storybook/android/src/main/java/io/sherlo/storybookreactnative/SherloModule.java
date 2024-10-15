package io.sherlo.storybookreactnative;

// Android Framework Imports
import android.app.Activity;
import android.net.Uri;
import android.util.Base64;
import android.util.Log;
import android.graphics.Rect;
import android.view.View;
import android.view.ViewGroup;
import android.graphics.drawable.ColorDrawable;
import android.widget.TextView;
import android.os.Handler;
import android.os.Looper;

// React Native Bridge Imports
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.ReactInstanceManager;
import com.facebook.react.ReactApplication;

// Java Utility and IO Imports
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
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

    public SherloModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        Log.i(TAG, "Initializing SherloModule with default mode: " + this.mode);

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
    public void toggleStorybook(Promise promise) {
        Log.d(TAG, "Toggling Storybook");
        try {
            if (this.mode == "storybook") {
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

    @ReactMethod
    public void openStorybook(Promise promise) {
        Log.d(TAG, "Opening Storybook");
        this.mode = "storybook";
        loadBundle();
        promise.resolve(null);
    }

    @ReactMethod
    public void closeStorybook(Promise promise) {
        Log.d(TAG, "Closing Storybook");
        this.mode = "default";
        loadBundle();
        promise.resolve(null);
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

    private void loadBundleLegacy() {
        final Activity currentActivity = getCurrentActivity();
        if (currentActivity == null) {
            return;
        }

        currentActivity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                currentActivity.recreate();
            }
        });
    }

    private void loadBundle() {
        try {
            final Activity currentActivity = getCurrentActivity();
            if (currentActivity == null) {
                Log.e(TAG, "Current activity is null");
                return;
            }

            ReactApplication reactApplication = (ReactApplication) currentActivity.getApplication();
            final ReactInstanceManager instanceManager = reactApplication.getReactNativeHost().getReactInstanceManager();
            
            if (instanceManager == null) {
                Log.e(TAG, "ReactInstanceManager is null");
                return;
            }

            new Handler(Looper.getMainLooper()).post(new Runnable() {
                @Override
                public void run() {
                    try {
                        instanceManager.recreateReactContextInBackground();
                    } catch (Exception e) {
                        Log.e(TAG, "Error loading bundle", e);
                        loadBundleLegacy();
                    }
                }
            });

        } catch (Exception e) {
            Log.e(TAG, "Error in loadBundle", e);
            loadBundleLegacy();
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
