package io.sherlo.storybookreactnative;

// Android OS and system utilities
import android.app.Activity;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;

// React Native bridge and application context
import com.facebook.react.ReactApplication;
import com.facebook.react.ReactInstanceManager;
import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.ReactApplication;
import com.facebook.react.ReactInstanceManager;
import android.content.Context;

// Java I/O and utility classes
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.System;
import java.util.HashMap;
import java.util.Map;

public class RNSherloModule extends ReactContextBaseJavaModule {
    public static final String RNSHERLO = "RNSherlo";
    private static final String CONFIG_FILENAME = "config.sherlo";

    private final ReactApplicationContext reactContext;    
    private static String sherloDirectoryPath = "";  
    private Boolean storybookInSingleActivity = false;  

    public RNSherloModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;

        // Set Sherlo directory path
        File externalDirectory = this.getReactApplicationContext().getExternalFilesDir(null);
        if (externalDirectory != null) {
            this.sherloDirectoryPath = externalDirectory.getAbsolutePath() + "/sherlo";
        }

        // If it's running on Sherlo server set Storybook mode
        String configPath = this.sherloDirectoryPath + "/" + CONFIG_FILENAME;

        if (new File(configPath).isFile()) {
            this.openStorybook(true);
        }
    }

    @Override
    public String getName() {
        return RNSHERLO;
    }
    
    @ReactMethod
    public void openStorybook(boolean singleActivity) {
        final Activity currentActivity = getCurrentActivity();
        if (currentActivity != null) {
            if (singleActivity) {
                Intent intent = new Intent(currentActivity, StorybookActivity.class);
                intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK | Intent.FLAG_ACTIVITY_NEW_TASK);
                currentActivity.startActivity(intent);
            } else {
                Intent intent = new Intent(currentActivity, StorybookActivity.class);
                currentActivity.startActivity(intent);
            }
            
            this.storybookInSingleActivity = singleActivity;
        }
    }

    @ReactMethod
    public void closeStorybook() {
        final Activity currentActivity = getCurrentActivity();
        if (currentActivity != null) {
            if(this.storybookInSingleActivity) {
                Intent intent = new Intent();
                intent.setClassName(currentActivity.getPackageName(), currentActivity.getPackageName() + ".MainActivity");
                intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK | Intent.FLAG_ACTIVITY_NEW_TASK);
                currentActivity.startActivity(intent);
            } else {
                StorybookActivity.close();
            }
        }
    }

    private void reject(Promise promise, String filepath, Exception ex) {
        if (ex instanceof FileNotFoundException) {
            promise.reject("ENOENT", "ENOENT: no such file or directory, open '" + filepath + "'");
            return;
        }
        if (ex instanceof IORejectionException) {
            IORejectionException ioRejectionException = (IORejectionException) ex;
            promise.reject(ioRejectionException.getCode(), ioRejectionException.getMessage());
            return;
        }

        promise.reject(null, ex.getMessage());
    }

    @ReactMethod
    public void mkdir(String filepath, ReadableMap options, Promise promise) {
        try {
            File file = new File(filepath);

            file.mkdirs();

            boolean exists = file.exists();

            if (!exists)
                throw new Exception("Directory could not be created");

            promise.resolve(null);
        } catch (Exception ex) {
            ex.printStackTrace();
            reject(promise, filepath, ex);
        }
    }

    @ReactMethod
    public void writeFile(String filepath, String base64Content, ReadableMap options, Promise promise) {
        try {
            byte[] bytes = Base64.decode(base64Content, Base64.DEFAULT);

            OutputStream outputStream = getOutputStream(filepath, false);
            outputStream.write(bytes);
            outputStream.close();

            promise.resolve(null);
        } catch (Exception ex) {
            ex.printStackTrace();
            reject(promise, filepath, ex);
        }
    }

    @ReactMethod
    public void appendFile(String filepath, String base64Content, Promise promise) {
        try {
            byte[] bytes = Base64.decode(base64Content, Base64.DEFAULT);

            OutputStream outputStream = getOutputStream(filepath, true);
            outputStream.write(bytes);
            outputStream.close();

            promise.resolve(null);
        } catch (Exception ex) {
            ex.printStackTrace();
            reject(promise, filepath, ex);
        }
    }

    @ReactMethod
    public void readFile(String filepath, Promise promise) {
        try {
            InputStream inputStream = getInputStream(filepath);
            byte[] inputData = getInputStreamBytes(inputStream);
            String base64Content = Base64.encodeToString(inputData, Base64.NO_WRAP);

            promise.resolve(base64Content);
        } catch (Exception ex) {
            ex.printStackTrace();
            reject(promise, filepath, ex);
        }
    }

    private OutputStream getOutputStream(String filepath, boolean append) throws IORejectionException {
        Uri uri = getFileUri(filepath, false);
        OutputStream stream;
        try {
            stream = reactContext.getContentResolver().openOutputStream(uri,
                    append ? "wa" : getWriteAccessByAPILevel());
        } catch (FileNotFoundException ex) {
            throw new IORejectionException("ENOENT", "ENOENT: " + ex.getMessage() + ", open '" + filepath + "'");
        }
        if (stream == null) {
            throw new IORejectionException("ENOENT", "ENOENT: could not open an output stream for '" + filepath + "'");
        }
        return stream;
    }

    private Uri getFileUri(String filepath, boolean isDirectoryAllowed) throws IORejectionException {
        Uri uri = Uri.parse(filepath);
        if (uri.getScheme() == null) {
            // No prefix, assuming that provided path is absolute path to file
            File file = new File(filepath);
            if (!isDirectoryAllowed && file.isDirectory()) {
                throw new IORejectionException("EISDIR",
                        "EISDIR: illegal operation on a directory, read '" + filepath + "'");
            }
            uri = Uri.parse("file://" + filepath);
        }
        return uri;
    }

    private String getWriteAccessByAPILevel() {
        return android.os.Build.VERSION.SDK_INT <= android.os.Build.VERSION_CODES.P ? "w" : "rwt";
    }

    private InputStream getInputStream(String filepath) throws IORejectionException {
        Uri uri = getFileUri(filepath, false);
        InputStream stream;
        try {
            stream = reactContext.getContentResolver().openInputStream(uri);
        } catch (FileNotFoundException ex) {
            throw new IORejectionException("ENOENT", "ENOENT: " + ex.getMessage() + ", open '" + filepath + "'");
        }
        if (stream == null) {
            throw new IORejectionException("ENOENT", "ENOENT: could not open an input stream for '" + filepath + "'");
        }
        return stream;
    }

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
            } catch (IOException ignored) {
            }
        }
        return bytesResult;
    }

    @Override
    public Map<String, Object> getConstants() {
        final Map<String, Object> constants = new HashMap<>();

        constants.put("sherloDirectoryPath", this.sherloDirectoryPath);

        return constants;
    }
}