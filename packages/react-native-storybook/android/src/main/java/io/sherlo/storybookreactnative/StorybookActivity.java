package io.sherlo.storybookreactnative;

import com.facebook.react.ReactActivity;
import android.os.Bundle;
import android.util.Log;

public class StorybookActivity extends ReactActivity {
    public static StorybookActivity instance;
    private static final String TAG = "StorybookActivity";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        instance = this;
        Log.d(TAG, "onCreate called");
    }

    @Override
    protected void onStart() {
        super.onStart();
        Log.d(TAG, "onStart called");
    }

    @Override
    protected void onResume() {
        super.onResume();
        Log.d(TAG, "onResume called");
    }

    @Override
    protected void onPause() {
        super.onPause();
        Log.d(TAG, "onPause called");
    }

    @Override
    protected void onStop() {
        super.onStop();
        Log.d(TAG, "onStop called");
    }

    @Override
    protected void onRestart() {
        super.onRestart();
        Log.d(TAG, "onRestart called");
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        instance = null;
        Log.d(TAG, "onDestroy called");
    }

    @Override
    protected String getMainComponentName() {
        Log.d(TAG, "getMainComponentName called");
        return "SherloStorybook";
    }

    public static void close() {
        if (instance != null) {
            instance.finish();
            Log.d(TAG, "close called and activity finished");
        }
    }
}
