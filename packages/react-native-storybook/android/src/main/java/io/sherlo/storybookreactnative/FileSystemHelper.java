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

public class FileSystemHelper {
    private static final String TAG = "FileSystemHelper";
    private final Context context;
    private final String syncDirectoryPath;

    public FileSystemHelper(Context context) {
        this.context = context;
        this.syncDirectoryPath = setupSyncDirectory();
    }

    public String setupSyncDirectory() {
        File externalDirectory = context.getExternalFilesDir(null);
        if (externalDirectory == null) {
            Log.e(TAG, "External storage is not accessible");
            return "";
        }
        return externalDirectory.getAbsolutePath() + "/sherlo";
    }
    
    /**
     * Appends base64 encoded data to a file.
     *
     * @param filepath The path of the file to append to
     * @param base64Content The base64 encoded content to append
     * @param promise The promise to resolve or reject
     */
    public void appendFileWithPromise(String filename, String base64Content, Promise promise) {
        try {
            appendFile(filename, base64Content);
            promise.resolve(null);
        } catch (Exception e) {
            handleError("ERROR_APPEND_FILE", e, promise, "Error appending to file: " + e.getMessage());
        }
    }
    
    /**
     * Reads a file and returns its content as base64 encoded string.
     *
     * @param filepath The path of the file to read
     * @param promise The promise to resolve or reject
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

    public void appendFile(String filename, String base64Content) throws Exception {
        byte[] bytes = Base64.decode(base64Content, Base64.DEFAULT);
        Uri uri = getFileUri(filename);
        OutputStream stream = context.getContentResolver().openOutputStream(uri, "wa");
        stream.write(bytes);
        stream.close();
    }

    public boolean fileExists(String filename) {
        Uri uri = getFileUri(filename);
        return uri != null && new File(uri.getPath()).exists();
    }

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

    private Uri getFileUri(String filename) {
        String absoluteFilepath = this.syncDirectoryPath + "/" + filename;
        return Uri.parse("file://" + absoluteFilepath);
    }
    
    private void handleError(String errorCode, Exception e, Promise promise, String message) {
        Log.e(TAG, message, e);
        promise.reject(errorCode.toLowerCase(), message, e);
    }
}
