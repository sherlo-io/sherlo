package io.sherlo.storybookreactnative;

import android.content.Context;
import android.net.Uri;
import android.util.Base64;
import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

public class FileSystemHelper {
    private static final String TAG = "FileSystemHelper";
    private final Context context;

    public FileSystemHelper(Context context) {
        this.context = context;
    }

    public void mkdir(String filepath) throws Exception {
        File file = new File(filepath);
        file.mkdirs();

        if (!file.exists()) {
            throw new Exception("Directory could not be created");
        }
    }

    public void appendFile(String filepath, String base64Content) throws Exception {
        byte[] bytes = Base64.decode(base64Content, Base64.DEFAULT);
        Uri uri = getFileUri(filepath);
        OutputStream stream = context.getContentResolver().openOutputStream(uri, "wa");
        stream.write(bytes);
        stream.close();
    }

    public String readFile(String filepath) throws Exception {
        Uri uri = getFileUri(filepath);
        InputStream stream = context.getContentResolver().openInputStream(uri);
        byte[] inputData = getInputStreamBytes(stream);
        return Base64.encodeToString(inputData, Base64.NO_WRAP);
    }

    public Uri getFileUri(String absoluteFilepath) {
        return Uri.parse("file://" + absoluteFilepath);
    }

    public static byte[] getInputStreamBytes(InputStream inputStream) throws IOException {
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
                Log.e(TAG, "Error closing byteBuffer", e);
            }
        }

        return bytesResult;
    }
}
