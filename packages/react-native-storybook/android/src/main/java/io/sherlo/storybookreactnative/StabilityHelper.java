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

import java.util.Arrays;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Helper for checking UI stability by comparing consecutive screenshots.
 * Used to determine when animations and rendering have completed.
 */
public class StabilityHelper {
    private static final String TAG = "SherloModule:StabilityHelper";

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
        if (activity == null) {
            Log.e(TAG, "Activity is null, cannot check stability");
            promise.reject("ACTIVITY_NOT_FOUND", "Activity is null, cannot check stability");
            return;
        }

        try {
            final Handler handler = new Handler(Looper.getMainLooper());
            
            // Use AtomicReference to hold mutable state that can be accessed from the Runnable
            final AtomicReference<Bitmap> lastScreenshot = new AtomicReference<>();
            final AtomicLong startTime = new AtomicLong(System.currentTimeMillis());
            final AtomicInteger consecutiveMatches = new AtomicInteger(0);
            
            lastScreenshot.set(captureScreenshot(activity));

            Runnable runnable = new Runnable() {
                @Override
                public void run() {
                    Bitmap currentScreenshot = captureScreenshot(activity);

                    if (areBitmapsEqual(currentScreenshot, lastScreenshot.get())) {
                        consecutiveMatches.incrementAndGet();
                        Log.d(TAG, "Screenshots match. Consecutive matches: " + consecutiveMatches.get());
                    } else {
                        consecutiveMatches.set(0);
                        Log.d(TAG, "Screenshots don't match. Resetting counter.");
                    }

                    Bitmap oldScreenshot = lastScreenshot.getAndSet(currentScreenshot);
                    if (oldScreenshot != null && !oldScreenshot.isRecycled()) {
                        oldScreenshot.recycle();
                    }

                    View rootView = activity.getWindow().getDecorView().getRootView();
                    boolean foundFocus = findAndClearFocus(rootView);

                    if(foundFocus) {
                        Log.d(TAG, "Found and cleared focus");
                        startTime.set(System.currentTimeMillis());
                        consecutiveMatches.set(0);
                    }

                    long elapsedTime = System.currentTimeMillis() - startTime.get();
                    if (consecutiveMatches.get() >= requiredMatches) {
                        Log.d(TAG, "UI is stable. Required matches reached: " + requiredMatches);
                        promise.resolve(true);
                    } else if (elapsedTime >= timeoutMs) {
                        Log.d(TAG, "Timeout reached without stability: " + timeoutMs + "ms");
                        promise.resolve(false);
                    } else {
                        handler.postDelayed(this, Math.max(intervalMs, 1));
                    }
                }
            };

            handler.postDelayed(runnable, Math.max(intervalMs, 1));
        } catch (Exception e) {
            Log.e(TAG, "Error checking UI stability", e);
            promise.reject("ERROR_CHECK_STABILITY", "Error checking UI stability: " + e.getMessage(), e);
        }
    }

    /**
     * Captures a screenshot of the activity's root view.
     * Creates a bitmap representation of the current UI.
     *
     * @param activity The activity to capture
     * @return A bitmap containing the screenshot
     * @throws RuntimeException if the view dimensions are invalid
     */
    private static Bitmap captureScreenshot(Activity activity) {
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
     * Compares two bitmaps to determine if they are identical.
     * Checks dimensions first, then compares all pixels for equality.
     *
     * @param bmp1 First bitmap to compare
     * @param bmp2 Second bitmap to compare
     * @return True if the bitmaps are identical, false otherwise
     */
    private static boolean areBitmapsEqual(Bitmap bmp1, Bitmap bmp2) {
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