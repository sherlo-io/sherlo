package io.sherlo.storybookreactnative;

import android.content.Context;
import android.net.Uri;
import android.util.Base64;
import android.util.Log;
import com.facebook.react.bridge.Promise;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Helper for file system operations in the Sherlo module.
 * Manages a dedicated synchronization directory for storing and retrieving files,
 * and provides methods for reading and writing data with Base64 encoding.
 */
public class FileSystemHelper {
    private static final String TAG = "SherloModule:FileSystemHelper";
    private final Context context;
    private final String syncDirectoryPath;

    /**
     * Initializes the helper with the application context and sets up the sync directory.
     *
     * @param context The application context
     */
    public FileSystemHelper(Context context) {
        this.context = context;
        this.syncDirectoryPath = setupSyncDirectory();
    }

    /**
     * Creates and returns the path to Sherlo's sync directory.
     * Uses the app's external files directory as the parent path.
     *
     * @return The absolute path to the sync directory, or an empty string if external storage is not accessible
     */
    public String setupSyncDirectory() {
        File externalDirectory = context.getExternalFilesDir(null);
        if (externalDirectory == null) {
            Log.e(TAG, "External storage is not accessible");
            return "";
        }
        return externalDirectory.getFileUri() + "/sherlo";
    }
    
    /**
     * Appends base64 encoded content to a file and handles promises for React Native.
     *
     * @param filename The name of the file to append to
     * @param base64Content The base64 encoded content to append
     * @param promise Promise to resolve when successful or reject with an error
     */
    public void appendFileWithPromise(String filename, String base64Content, Promise promise) {
        try {
            byte[] bytes = Base64.decode(base64Content, Base64.DEFAULT);
            Uri uri = getFileUri(filename);
            OutputStream stream = context.getContentResolver().openOutputStream(uri, "wa");
            stream.write(bytes);
            stream.close();

            promise.resolve(null);
        } catch (Exception e) {
            handleError("ERROR_APPEND_FILE", e, promise, "Error appending to file: " + e.getMessage());
        }
    }
    
    /**
     * Reads a file and returns its base64 encoded content via a promise.
     *
     * @param filename The name of the file to read
     * @param promise Promise to resolve with the file content or reject with an error
     */
    public void readFileWithPromise(String filename, Promise promise) {
        try {
            String base64Content = readFile(filename);
            if (base64Content == null || base64Content.isEmpty()) {
                promise.reject("error_read_file", "File content is empty or could not be encoded to base64");
            } else {
                promise.resolve(base64Content);
            }
        } catch (Exception e) {
            handleError("ERROR_READ_FILE", e, promise, "Error reading file: " + e.getMessage());
        }
    }

    /**
     * Checks if a file exists in the sync directory.
     *
     * @param filename The name of the file to check
     * @return True if the file exists, false otherwise
     */
    public boolean fileExists(String filename) {
        Uri uri = getFileUri(filename);
        return uri != null && new File(uri.getPath()).exists();
    }

    /**
     * Reads a file and returns its content as a base64 encoded string.
     *
     * @param filename The name of the file to read
     * @return The file content as a base64 encoded string
     * @throws Exception If there's an error during file access or reading
     */
    public String readFile(String filename) throws Exception {
        Uri uri = getFileUri(filename);
        
        InputStream inputStream = context.getContentResolver().openInputStream(uri);
        ByteArrayOutputStream byteBuffer = new ByteArrayOutputStream();

        byte[] bytesResult;
        byte[] buffer = new byte[1024];

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
                Log.e(TAG, "Error closing byteBuffer", e);
            }
        }

        return Base64.encodeToString(bytesResult, Base64.NO_WRAP);
    }

    /**
     * Creates a file URI for a file in the sync directory.
     *
     * @param filename The name of the file
     * @return A Uri object representing the file's location
     */
    private Uri getFileUri(String filename) {
        String absoluteFilepath = this.syncDirectoryPath + "/" + filename;
        return Uri.parse("file://" + absoluteFilepath);
    }
    
    /**
     * Handles errors by logging them and rejecting a promise with appropriate details.
     *
     * @param errorCode The error code for the promise rejection
     * @param e The exception that occurred
     * @param promise The promise to reject
     * @param message The error message
     */
    private void handleError(String errorCode, Exception e, Promise promise, String message) {
        Log.e(TAG, message, e);
        promise.reject(errorCode.toLowerCase(), message, e);
    }
}
