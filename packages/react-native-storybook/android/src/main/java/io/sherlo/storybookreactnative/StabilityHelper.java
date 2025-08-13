package io.sherlo.storybookreactnative;

import android.app.Activity;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.Looper;
import android.view.Choreographer;
import android.view.PixelCopy;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.InputMethodManager;

import com.facebook.react.bridge.Promise;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Helper for checking UI stability by comparing consecutive screenshots.
 * Used to determine when animations and rendering have completed.
 */
public class StabilityHelper {
    private static final String TAG = "SherloModule:StabilityHelper";

    public interface StabilityCallback {
        void onResult(boolean isStable);
    }

    /**
     * Checks if the UI is stable by taking consecutive screenshots and comparing
     * them.
     * Resolves the promise when the required number of matching screenshots is
     * reached,
     * or when the timeout is exceeded.
     *
     * @param activity        The current activity to check for stability
     * @param requiredMatches Number of consecutive matching screenshots needed to
     *                        consider UI stable
     * @param intervalMs      Time interval between screenshots in milliseconds
     * @param timeoutMs       Maximum time to wait for stability in milliseconds
     * @param saveScreenshots Whether to save screenshots to filesystem during tests
     * @param threshold       Matching threshold (0.0 to 1.0); smaller values are
     *                        more sensitive
     * @param includeAA       If false, ignore anti-aliased pixels when counting
     *                        differences
     * @param promise         Promise to resolve with true if UI becomes stable,
     *                        false if timeout occurs
     */
    public static void stabilize(Activity activity, int requiredMatches, int minScreenshotsCount, int intervalMs,
            int timeoutMs, boolean saveScreenshots, double threshold, boolean includeAA, Promise promise) {
        StabilityHelper helper = new StabilityHelper();
        helper.checkIfStable(activity, requiredMatches, minScreenshotsCount, intervalMs, timeoutMs, saveScreenshots,
                threshold, includeAA, new StabilityCallback() {
                    @Override
                    public void onResult(boolean isStable) {
                        promise.resolve(isStable);
                    }
                });
    }

    /**
     * Captures a screenshot of the activity's root view.
     * This must NOT block the UI thread; it performs UI nudges on the main thread
     * but waits on a background thread.
     */
    public Bitmap captureScreenshot(Activity activity, boolean saveToFile, int screenshotNumber) {
        final View rootView = activity.getWindow().getDecorView().getRootView();
        final int width = rootView.getWidth();
        final int height = rootView.getHeight();
        if (width <= 0 || height <= 0) {
            throw new RuntimeException("Impossible to snapshot the view: view is invalid");
        }

        // 0) Ensure we're NOT running this method on the UI thread to avoid deadlocks
        if (Looper.myLooper() == Looper.getMainLooper()) {
            Log.w(TAG,
                    "captureScreenshot called on UI thread; this can cause timeouts. Consider calling from a background thread.");
        }

        // 1) PRE-CAPTURE NUDGE: on UI thread, rebuild layer + invalidate + wait 2
        // vsyncs
        final CountDownLatch readyForCopy = new CountDownLatch(1);
        runOnUiThread(activity, () -> {
            try {
                // Toggle layer type to rebuild hardware layer safely
                int lt = rootView.getLayerType();
                rootView.setLayerType(View.LAYER_TYPE_NONE, null);
                rootView.setLayerType(lt, null);

                // Optional heavier nudge: requestLayout to force measure/layout when text is
                // suspect
                // rootView.requestLayout();

                // Schedule a redraw next frame
                rootView.postInvalidateOnAnimation();

                // Wait two frames to ensure fresh content is rendered
                Choreographer.getInstance().postFrameCallback(
                        ft -> Choreographer.getInstance().postFrameCallback(ft2 -> readyForCopy.countDown()));
            } catch (Throwable t) {
                Log.w(TAG, "Pre-capture nudge failed", t);
                readyForCopy.countDown();
            }
        });
        try {
            readyForCopy.await(500, TimeUnit.MILLISECONDS);
        } catch (InterruptedException ignored) {
        }

        // 2) Allocate destination bitmap
        final Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);

        // 3) PixelCopy from the Window using a background handler for the callback
        final CountDownLatch pixelCopyLatch = new CountDownLatch(1);
        final AtomicInteger resultHolder = new AtomicInteger(-1);

        // Use a dedicated handler thread for PixelCopy callbacks
        HandlerThread ht = new HandlerThread("SherloPixelCopy");
        ht.start();
        Handler copyHandler = new Handler(ht.getLooper());

        try {
            PixelCopy.request(activity.getWindow(), bitmap, copyResult -> {
                resultHolder.set(copyResult);
                pixelCopyLatch.countDown();
            }, copyHandler);

            // Wait up to 1s for the copy to finish
            if (!pixelCopyLatch.await(1000, TimeUnit.MILLISECONDS)) {
                Log.d(TAG, "PixelCopy timeout; will fall back to View#draw");
            }
        } catch (Throwable t) {
            Log.w(TAG, "PixelCopy threw; will fall back to View#draw", t);
        } finally {
            try {
                ht.quitSafely();
            } catch (Throwable ignored) {
            }
        }

        // 4) Fallback: draw the view hierarchy if copy failed or returned no data
        if (resultHolder.get() != PixelCopy.SUCCESS) {
            runOnUiThread(activity, () -> {
                try {
                    Canvas canvas = new Canvas(bitmap);
                    rootView.draw(canvas);
                } catch (Throwable t) {
                    Log.e(TAG, "Error while drawing canvas fallback", t);
                }
            });
        }

        // 5) Save if requested
        if (saveToFile) {
            saveBitmapToFile(activity, bitmap, screenshotNumber);
        }

        return bitmap;
    }

    /**
     * Saves a bitmap to a file in the app's external files directory.
     */
    private void saveBitmapToFile(Context context, Bitmap bitmap, int screenshotNumber) {
        try {
            // Create directory if it doesn't exist
            File externalDirectory = context.getExternalFilesDir(null);
            File storageDir = new File(externalDirectory.getAbsolutePath() + "/sherlo/stabilization_screenshots");
            if (!storageDir.exists()) {
                storageDir.mkdirs();
            }

            // Create file with timestamp
            String timestamp = new SimpleDateFormat("yyyyMMdd_HHmmss_SSS", Locale.US).format(new Date());
            File imageFile = new File(storageDir, timestamp + "_screenshot_" + screenshotNumber + ".png");

            // Save bitmap to file
            FileOutputStream fos = new FileOutputStream(imageFile);
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, fos);
            fos.close();

            Log.d(TAG, "Saved screenshot to: " + imageFile.getAbsolutePath());
        } catch (IOException e) {
            Log.e(TAG, "Failed to save screenshot", e);
        }
    }

    /**
     * Checks for UI stability by comparing consecutive screenshots.
     *
     * @param requiredMatches     The number of consecutive matching screenshots
     *                            needed.
     * @param minScreenshotsCount The minimum number of screenshots to take when
     *                            checking for stability.
     * @param intervalMs          The interval between each screenshot (in
     *                            milliseconds).
     * @param timeoutMs           The overall timeout (in milliseconds).
     * @param saveScreenshots     Whether to save screenshots to filesystem during
     *                            tests
     * @param threshold           Matching threshold (0.0 to 1.0); smaller values
     *                            are more sensitive
     * @param includeAA           If false, ignore anti-aliased pixels when counting
     *                            differences
     * @param callback            Callback with the result: true if stable, false
     *                            otherwise.
     */
    public void checkIfStable(final Activity activity, final int requiredMatches, final int minScreenshotsCount,
            final int intervalMs, final int timeoutMs, boolean saveScreenshots, double threshold, boolean includeAA,
            final StabilityCallback callback) {
        final Handler mainHandler = new Handler(Looper.getMainLooper());
        final HandlerThread captureThread = new HandlerThread("SherloStabilityLoop");
        captureThread.start();
        final Handler captureHandler = new Handler(captureThread.getLooper());

        final Bitmap[] lastScreenshot = new Bitmap[1];
        final AtomicLong startTime = new AtomicLong(System.currentTimeMillis());
        final AtomicInteger consecutiveMatches = new AtomicInteger(0);
        final AtomicInteger screenshotCounter = new AtomicInteger(0);

        // Initial capture on background thread
        captureHandler.post(() -> {
            lastScreenshot[0] = captureScreenshot(activity, saveScreenshots, screenshotCounter.getAndIncrement());

            Runnable loop = new Runnable() {
                @Override
                public void run() {
                    try {
                        Bitmap current = captureScreenshot(activity, saveScreenshots,
                                screenshotCounter.incrementAndGet());
                        long elapsedTime = System.currentTimeMillis() - startTime.get();

                        try {
                            int differentPixels = Pixelmatch.pixelmatch(current, lastScreenshot[0], threshold,
                                    includeAA);
                            boolean imagesMatch = (differentPixels == 0);

                            if (imagesMatch) {
                                int n = consecutiveMatches.incrementAndGet();
                                Log.d(TAG, "Consecutive match number: " + n);
                            } else {
                                Log.d(TAG, "No consecutive match - " + differentPixels + " different pixels");
                                consecutiveMatches.set(0);
                            }
                        } catch (IllegalArgumentException e) {
                            Log.d(TAG, "Bitmaps have different dimensions: " + e.getMessage());
                            consecutiveMatches.set(0);
                        }

                        // Recycle previous screenshot to free memory
                        if (lastScreenshot[0] != null && !lastScreenshot[0].isRecycled()) {
                            lastScreenshot[0].recycle();
                        }
                        lastScreenshot[0] = current;

                        // Clear focus / IME on UI thread; if it changed, reset timers and counters
                        boolean[] foundFocus = new boolean[] { false };
                        runOnUiThread(activity, () -> foundFocus[0] = clearFocusAndHideIme(activity));
                        if (foundFocus[0]) {
                            Log.d(TAG, "Found and cleared focus");
                            startTime.set(System.currentTimeMillis());
                            consecutiveMatches.set(0);
                        }

                        if (consecutiveMatches.get() >= requiredMatches) {
                            Log.d(TAG, "UI is stable");
                            finish(true);
                            return;
                        }

                        if (elapsedTime >= timeoutMs && consecutiveMatches.get() == 0
                                && screenshotCounter.get() >= minScreenshotsCount) {
                            Log.d(TAG, "UI is not stable - timeout with no matches");
                            finish(false);
                            return;
                        }

                        // Schedule next iteration
                        captureHandler.postDelayed(this, Math.max(intervalMs, 1));
                    } catch (Throwable t) {
                        Log.e(TAG, "Stability loop error", t);
                        finish(false);
                    }
                }

                private void finish(boolean result) {
                    try {
                        callback.onResult(result);
                    } finally {
                        try {
                            captureThread.quitSafely();
                        } catch (Throwable ignored) {
                        }
                    }
                }
            };

            captureHandler.postDelayed(loop, Math.max(intervalMs, 1));
        });
    }

    /**
     * Helps ensure UI stability by removing any blinking cursors or focus
     * highlights.
     *
     * @param activity The activity to check for focus and its children
     * @return True if a focused view was found and cleared, false otherwise
     */
    private static boolean clearFocusAndHideIme(Activity activity) {
        View root = activity.getWindow().getDecorView();
        View focused = root.findFocus();
        if (focused == null)
            return false;

        // 1) clear focus
        focused.clearFocus();

        // 2) hide IME explicitly
        InputMethodManager imm = (InputMethodManager) activity.getSystemService(Context.INPUT_METHOD_SERVICE);
        IBinder token = focused.getWindowToken();
        if (imm != null && token != null) {
            imm.hideSoftInputFromWindow(token, 0);
        }

        // 3) prevent instant re-focus for one frame
        ViewGroup content = activity.findViewById(android.R.id.content);
        if (content != null) {
            content.setDescendantFocusability(ViewGroup.FOCUS_BLOCK_DESCENDANTS);
            new Handler(Looper.getMainLooper())
                    .postDelayed(() -> content.setDescendantFocusability(ViewGroup.FOCUS_AFTER_DESCENDANTS), 16);
        }

        return true;
    }

    /**
     * Utility: run a small task on the UI thread and wait (up to 1s) for it to
     * complete.
     */
    private static void runOnUiThread(Activity activity, Runnable r) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            r.run();
            return;
        }
        final CountDownLatch latch = new CountDownLatch(1);
        activity.runOnUiThread(() -> {
            try {
                r.run();
            } finally {
                latch.countDown();
            }
        });
        try {
            latch.await(1000, TimeUnit.MILLISECONDS);
        } catch (InterruptedException ignored) {
        }
    }
}
