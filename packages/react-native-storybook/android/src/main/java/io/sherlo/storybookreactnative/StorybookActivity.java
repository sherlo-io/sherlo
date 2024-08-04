package io.sherlo.storybookreactnative;

import com.facebook.react.ReactActivity;
import android.os.Bundle;

public class StorybookActivity extends ReactActivity {
    private static StorybookActivity instance;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        instance = this;
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        instance = null;
    }

    @Override
    protected String getMainComponentName() {
        return "Storybook";
    }

    public static void close() {
        if (instance != null) {
            instance.finish();
        }
    }
}
