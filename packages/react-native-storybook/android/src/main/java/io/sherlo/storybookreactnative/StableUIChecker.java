package io.sherlo.storybookreactnative;

import android.app.Activity;
import android.graphics.Bitmap;
import android.os.Handler;
import android.os.Looper;
import android.view.View;

import java.util.Arrays;

public class StableUIChecker {

    public interface StabilityCallback {
        void onResult(boolean stable);
    }

    private Activity activity;

    public StableUIChecker(Activity activity) {
        this.activity = activity;
    }

    /**
     * Captures a screenshot of the activity's root view.
     */
    public Bitmap captureScreenshot() {
        View rootView = activity.getWindow().getDecorView().getRootView();
        // Enable drawing cache (deprecated in later Android versions; consider alternatives in production)
        rootView.setDrawingCacheEnabled(true);
        Bitmap bitmap = Bitmap.createBitmap(rootView.getDrawingCache());
        rootView.setDrawingCacheEnabled(false);
        return bitmap;
    }

    /**
     * Compares two bitmaps by checking pixel arrays.
     */
    public boolean areBitmapsEqual(Bitmap bmp1, Bitmap bmp2) {
        if (bmp1.getWidth() != bmp2.getWidth() || bmp1.getHeight() != bmp2.getHeight()) {
            return false;
        }
        int width = bmp1.getWidth();
        int height = bmp1.getHeight();
        int[] pixels1 = new int[width * height];
        int[] pixels2 = new int[width * height];
        bmp1.getPixels(pixels1, 0, width, 0, 0, width, height);
        bmp2.getPixels(pixels2, 0, width, 0, 0, width, height);
        return Arrays.equals(pixels1, pixels2);
    }

    /**
     * Checks for UI stability by comparing consecutive screenshots.
     *
     * @param requiredMatches The number of consecutive matching screenshots needed.
     * @param intervalMs      The interval between each screenshot (in milliseconds).
     * @param timeoutMs       The overall timeout (in milliseconds).
     * @param callback        Callback with the result: true if stable, false otherwise.
     */
    public void checkIfStable(final int requiredMatches, final int intervalMs, final int timeoutMs,
                              final StabilityCallback callback) {
        // Handler to post work on the main thread.
        final Handler handler = new Handler(Looper.getMainLooper());

        // Capture the initial screenshot.
        final Bitmap[] lastScreenshot = new Bitmap[1];
        lastScreenshot[0] = captureScreenshot();

        final int[] consecutiveMatches = {0};
        final int[] elapsedTime = {0};

        // Runnable that performs screenshot capturing and comparison.
        Runnable runnable = new Runnable() {
            @Override
            public void run() {
                Bitmap currentScreenshot = captureScreenshot();

                if (areBitmapsEqual(currentScreenshot, lastScreenshot[0])) {
                    consecutiveMatches[0]++;
                } else {
                    consecutiveMatches[0] = 0; // Reset if screenshots don't match.
                }

                // Recycle the previous bitmap to free memory.
                if (lastScreenshot[0] != null && !lastScreenshot[0].isRecycled()) {
                    lastScreenshot[0].recycle();
                }
                lastScreenshot[0] = currentScreenshot;

                elapsedTime[0] += intervalMs;

                if (consecutiveMatches[0] >= requiredMatches) {
                    // Sufficient consecutive matches found.
                    callback.onResult(true);
                } else if (elapsedTime[0] >= timeoutMs) {
                    // Timeout reached without achieving stability.
                    callback.onResult(false);
                } else {
                    // Schedule next check.
                    handler.postDelayed(this, intervalMs);
                }
            }
        };

        // Start the first delayed check.
        handler.postDelayed(runnable, intervalMs);
    }
}
