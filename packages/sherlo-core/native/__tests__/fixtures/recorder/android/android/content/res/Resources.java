package android.content.res;

import android.util.DisplayMetrics;

/** The recorder's Resources: the display metrics and the configuration. */
public class Resources {
    public DisplayMetrics displayMetrics = new DisplayMetrics();
    public Configuration configuration = new Configuration();

    public DisplayMetrics getDisplayMetrics() {
        return displayMetrics;
    }

    public Configuration getConfiguration() {
        return configuration;
    }
}
