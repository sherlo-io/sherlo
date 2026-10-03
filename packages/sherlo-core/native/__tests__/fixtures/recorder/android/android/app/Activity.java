package android.app;

import android.view.Window;

/** The recorder's Activity: its window, and a UI thread that runs a task at once. */
public class Activity {
    public Window window = new Window();

    public Window getWindow() {
        return window;
    }

    public void runOnUiThread(Runnable task) {
        task.run();
    }
}
