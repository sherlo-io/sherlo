package io.sherlo.storybookreactnative;

import com.facebook.react.ReactActivity;
import android.os.Bundle;
import android.util.Log;

public class SherloStorybookActivity extends ReactActivity {
    public static SherloStorybookActivity instance;
    
    private static final String TAG = "SherloStorybookActivity";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        instance = this;
        Log.i(TAG, "activity created");
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        instance = null;
    }

    @Override
    protected String getMainComponentName() {
        return "SherloStorybook";
    }

    public static void close() {
        if (instance != null) {
            instance.finish();
            Log.i(TAG, "closing activity");
        }
    }
}
