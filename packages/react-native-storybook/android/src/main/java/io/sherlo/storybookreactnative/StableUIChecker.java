package io.sherlo.storybookreactnative;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.os.Handler;
import android.os.Looper;
import android.view.View;

import java.util.Arrays;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import android.view.PixelCopy;

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
        int width = rootView.getWidth();
        int height = rootView.getHeight();
        
        if (width <= 0 || height <= 0) {
            throw new RuntimeException("Impossible to snapshot the view: view is invalid");
        }

        // Use RGB_565 instead of ARGB_8888 to reduce memory usage (half the bits per pixel)
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565);
        Canvas canvas = new Canvas(bitmap);
        
        rootView.draw(canvas);

        return bitmap;
    }

    /**
     * Compares two bitmaps by checking pixel arrays with early exit on difference.
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
        final Handler handler = new Handler(Looper.getMainLooper());
        final Bitmap[] lastScreenshot = new Bitmap[1];
        final long startTime = System.currentTimeMillis();
        
        lastScreenshot[0] = captureScreenshot();
        startStabilityCheck(requiredMatches, intervalMs, timeoutMs, callback, handler, lastScreenshot, startTime);
    }

    private void startStabilityCheck(final int requiredMatches, final int intervalMs, final int timeoutMs,
                                   final StabilityCallback callback, final Handler handler, 
                                   final Bitmap[] lastScreenshot, final long startTime) {
        final int[] consecutiveMatches = {0};

        Runnable runnable = new Runnable() {
            @Override
            public void run() {
                Bitmap currentScreenshot = captureScreenshot();
                long elapsedTime = System.currentTimeMillis() - startTime;

                if (areBitmapsEqual(currentScreenshot, lastScreenshot[0])) {
                    consecutiveMatches[0]++;
                } else {
                    consecutiveMatches[0] = 0;
                }

                if (lastScreenshot[0] != null && !lastScreenshot[0].isRecycled()) {
                    lastScreenshot[0].recycle();
                }
                lastScreenshot[0] = currentScreenshot;

                if (consecutiveMatches[0] >= requiredMatches) {
                    callback.onResult(true);
                } else if (elapsedTime >= timeoutMs) {
                    callback.onResult(false);
                } else {
                    handler.postDelayed(this, Math.max(intervalMs, 1));
                }
            }
        };

        handler.postDelayed(runnable, Math.max(intervalMs, 1));
    }
}