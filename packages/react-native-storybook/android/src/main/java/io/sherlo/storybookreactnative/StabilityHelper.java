package io.sherlo.storybookreactnative;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.util.Log;
import com.facebook.react.bridge.Promise;
import android.view.PixelCopy;

import java.util.Arrays;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

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
     * Checks if the UI is stable by taking consecutive screenshots and comparing them.
     * Resolves the promise when the required number of matching screenshots is reached,
     * or when the timeout is exceeded.
     *
     * @param activity The current activity to check for stability
     * @param requiredMatches Number of consecutive matching screenshots needed to consider UI stable
     * @param intervalMs Time interval between screenshots in milliseconds
     * @param timeoutMs Maximum time to wait for stability in milliseconds
     * @param promise Promise to resolve with true if UI becomes stable, false if timeout occurs
     */
    public static void stabilize(Activity activity, int requiredMatches, int intervalMs, int timeoutMs, Promise promise) {
        StabilityHelper helper = new StabilityHelper();
        helper.checkIfStable(activity, requiredMatches, intervalMs, timeoutMs, new StabilityCallback() {
            @Override
            public void onResult(boolean isStable) {
                promise.resolve(isStable);
            }
        });
    }

    /**
     * Captures a screenshot of the activity's root view.
     */
    public Bitmap captureScreenshot(Activity activity) {
        View rootView = activity.getWindow().getDecorView().getRootView();
        int width = rootView.getWidth();
        int height = rootView.getHeight();
        
        if (width <= 0 || height <= 0) {
            throw new RuntimeException("Impossible to snapshot the view: view is invalid");
        }

        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        
        rootView.draw(canvas);

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N) {
            final CountDownLatch latch = new CountDownLatch(1);
            
            PixelCopy.request(activity.getWindow(), bitmap, copyResult -> {
                latch.countDown();
            }, new Handler(Looper.getMainLooper()));

            try {
                // Reduced timeout to 1 second
                if (!latch.await(1, TimeUnit.SECONDS)) {
                    // If timeout occurs, just use the canvas-based screenshot
                    return bitmap;
                }
            } catch (InterruptedException e) {
                // If interrupted, use the canvas-based screenshot
                return bitmap;
            }
        }

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
    public void checkIfStable(final Activity activity, final int requiredMatches, final int intervalMs, final int timeoutMs,
                              final StabilityCallback callback) {
        final Handler handler = new Handler(Looper.getMainLooper());
        final Bitmap[] lastScreenshot = new Bitmap[1];
        final AtomicLong startTime = new AtomicLong(System.currentTimeMillis());
        
        lastScreenshot[0] = captureScreenshot(activity);
        startStabilityCheck(activity, requiredMatches, intervalMs, timeoutMs, callback, handler, lastScreenshot, startTime);
    }

    private void startStabilityCheck(final Activity activity, final int requiredMatches, final int intervalMs, final int timeoutMs,
                                   final StabilityCallback callback, final Handler handler, 
                                   final Bitmap[] lastScreenshot, final AtomicLong startTime) {
        final int[] consecutiveMatches = {0};


        Runnable runnable = new Runnable() {
            @Override
            public void run() {
                Bitmap currentScreenshot = captureScreenshot(activity);
                long elapsedTime = System.currentTimeMillis() - startTime.get();

                if (areBitmapsEqual(currentScreenshot, lastScreenshot[0])) {
                    Log.d(TAG, "Consecutive match number: " + consecutiveMatches[0]);
                    consecutiveMatches[0]++;
                } else {
                    Log.d(TAG, "No consecutive match");
                    consecutiveMatches[0] = 0;
                }

                if (lastScreenshot[0] != null && !lastScreenshot[0].isRecycled()) {
                    lastScreenshot[0].recycle();
                }
                lastScreenshot[0] = currentScreenshot;

                View rootView = activity.getWindow().getDecorView().getRootView();
                boolean foundFocus = findAndClearFocus(rootView);

                if(foundFocus) {
                    Log.d(TAG, "Found and cleared focus");
                    startTime.set(System.currentTimeMillis());
                    consecutiveMatches[0] = 0;
                }

                if (consecutiveMatches[0] >= requiredMatches) {
                    Log.d(TAG, "UI is stable");
                    callback.onResult(true);
                } else if (elapsedTime >= timeoutMs) {
                    Log.d(TAG, "UI is not stable");
                    callback.onResult(false);
                } else {
                    handler.postDelayed(this, Math.max(intervalMs, 1));
                }
            }
        };

        handler.postDelayed(runnable, Math.max(intervalMs, 1));
    }


    /**
     * Recursively searches for and clears any focused view in the hierarchy.
     * Helps ensure UI stability by removing any blinking cursors or focus highlights.
     *
     * @param view The view to check for focus and its children
     * @return True if a focused view was found and cleared, false otherwise
     */
    private static boolean findAndClearFocus(View view) {
        if (view == null) return false;

        // Check if current view is focused
        if (view.isFocused()) {
            view.clearFocus();
            return true;  // Found and cleared focus, no need to continue
        }

        // If view is a ViewGroup, check all its children
        if (view instanceof ViewGroup) {
            ViewGroup viewGroup = (ViewGroup) view;
            for (int i = 0; i < viewGroup.getChildCount(); i++) {
                if (findAndClearFocus(viewGroup.getChildAt(i))) {
                    return true;  // Focus was found and cleared in a child view
                }
            }
        }

        return false;
    }
} 