package io.sherlo.storybookreactnative;

// Android Framework Imports
import android.app.Activity;
import android.content.Context;
import android.util.Log;
import android.content.Intent;
import android.view.View;

// React Native Bridge Imports
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;
// Java Utility and IO Imports
import java.util.HashMap;
import java.util.Map;
import org.json.JSONObject;

/**
 * Core implementation for the Sherlo module containing all business logic.
 * Manages application modes (default, storybook, testing) and provides access to helper utilities.
 */
public class SherloModuleCore {
    private static final String TAG = "SherloModule:Core";

    // Mode constants
    public static final String MODE_DEFAULT = "default";
    public static final String MODE_STORYBOOK = "storybook";
    public static final String MODE_TESTING = "testing";

    // Module state
    private static JSONObject config = null;
    private static JSONObject lastState = null;
    private static String currentMode = MODE_DEFAULT;

    // Helper instances
    private FileSystemHelper fileSystemHelper = null;
    private RestartHelper restartHelper = null;

    /**
     * Initializes the module with the React context and sets up all required helpers.
     * Loads configuration and determines the initial mode to use.
     * 
     * @param reactContext The React application context
     */
    public SherloModuleCore(ReactApplicationContext reactContext, Activity activity) {
        this.fileSystemHelper = new FileSystemHelper(reactContext);
        this.restartHelper = new RestartHelper(reactContext);

        this.config = ConfigHelper.loadConfig(this.fileSystemHelper);

        String persistedMode = restartHelper.getPersistedMode();
        if (persistedMode != null) {
            // We have a valid persisted mode that hasn't expired, use it
            this.currentMode = persistedMode;
            Log.d(TAG, "Using persisted mode: " + currentMode);
        } else if (this.config != null) {
            // Fallback to config-based mode
            this.currentMode = ConfigHelper.determineModeFromConfig(this.config);
            Log.d(TAG, "Using config-based mode: " + currentMode);
            
            if (currentMode.equals(MODE_TESTING)) {
                this.lastState = LastStateHelper.getLastState(this.fileSystemHelper);

                String requestId = null;
                if (this.lastState != null) {
                    try {
                        requestId = this.lastState.getString("requestId");
                    } catch (org.json.JSONException e) {
                        Log.e(TAG, "Error getting requestId from lastState", e);
                    }
                }

                JSONObject nativeLoadedProtocolItem = new JSONObject();
                try {
                    nativeLoadedProtocolItem.put("action", "NATIVE_LOADED");
                    if (requestId != null) {
                        nativeLoadedProtocolItem.put("requestId", requestId);
                    }
                    nativeLoadedProtocolItem.put("timestamp", System.currentTimeMillis());
                    nativeLoadedProtocolItem.put("entity", "app");

                    this.fileSystemHelper.appendFile("protocol.sherlo", nativeLoadedProtocolItem.toString() + "\n");
                } catch (org.json.JSONException e) {
                    Log.e(TAG, "Error creating protocol item", e);
                }
            }
        }

        Log.d(TAG, "SherloModuleCore initialized with mode: " + currentMode);
    }
    
    /**
     * Returns constants exposed to the JavaScript side.
     * Provides access to the current mode, configuration and last state.
     * 
     * @return A map containing the module constants
     */
    public WritableMap getSherloConstants() {
        final WritableMap constants = Arguments.createMap();
        constants.putString("mode", this.currentMode);
        constants.putString("config", this.config != null ? this.config.toString() : null);
        constants.putString("lastState", this.lastState != null ? this.lastState.toString() : null);
        return constants;
    }

    /**
     * Toggles between Storybook and default modes.
     * If currently in Storybook mode, switches to default, otherwise switches to Storybook.
     */
    public void toggleStorybook() {
        String newMode = currentMode.equals(MODE_STORYBOOK) ? MODE_DEFAULT : MODE_STORYBOOK;
        restartHelper.restart(newMode);
    }

    /**
     * Switches to Storybook mode and restarts the React context.
     */
    public void openStorybook() {
        restartHelper.restart(MODE_STORYBOOK);
    }

    /**
     * Switches to default mode and restarts the React context.
     */
    public void closeStorybook() {
        restartHelper.restart(MODE_DEFAULT);
    }

    /**
     * Appends base64 encoded content to a file.
     * 
     * @param filename The name of the file to append to
     * @param base64Content The base64 encoded content to append
     * @param promise Promise to resolve or reject
     */
    public void appendFile(String filename, String base64Content, Promise promise) {
        fileSystemHelper.appendFileWithPromise(filename, base64Content, promise);
    }

    /**
     * Reads a file and returns its content as a base64 encoded string.
     * 
     * @param filename The name of the file to read
     * @param promise Promise to resolve with the content or reject with an error
     */
    public void readFile(String filename, Promise promise) {
        fileSystemHelper.readFileWithPromise(filename, promise);
    }

    /**
     * Gets UI inspector data from the current view hierarchy.
     * 
     * @param activity The current activity
     * @param promise Promise to resolve with the inspector data or reject with an error
     */
    public void getInspectorData(Activity activity, Promise promise) {
        InspectorHelper.getInspectorData(activity, promise);
    }

    /**
     * Checks if the UI is stable by comparing consecutive screenshots.
     * 
     * @param activity The current activity
     * @param requiredMatches The number of consecutive matching screenshots needed
     * @param minScreenshotsCount The minimum number of screenshots to take when checking for stability
     * @param intervalMs The interval between each screenshot (in milliseconds)
     * @param timeoutMs The overall timeout (in milliseconds)
     * @param saveScreenshots Whether to save screenshots to filesystem during tests
     * @param threshold Matching threshold (0.0 to 1.0); smaller values are more sensitive
     * @param includeAA If false, ignore anti-aliased pixels when counting differences
     * @param promise Promise to resolve with the stability result or reject with an error
     */
    public void stabilize(Activity activity, int requiredMatches, int minScreenshotsCount, int intervalMs, int timeoutMs, boolean saveScreenshots, double threshold, boolean includeAA, Promise promise) {
        StabilityHelper.stabilize(activity, requiredMatches, minScreenshotsCount, intervalMs, timeoutMs, saveScreenshots, threshold, includeAA, promise);
    }

    // ============ Scroll Detection ============

    private static final boolean SCROLL_DEBUG = true;
    private static final float EPSILON = 4.0f;
    private static final float NUDGE_PX = 3.0f;
    private static final float MIN_SCROLL_RANGE_RATIO = 0.20f; // Minimum 20% of viewport height

    // Locked scroll view from isScrollable(), reused by scrollToCheckpoint()
    private View lockedScrollView = null;

    /**
     * Detects if the currently visible screen can be vertically scrolled for long-screenshot capture.
     * Resolves with a map: {scrollable: boolean, scrollViewFrame?: {x, y, width, height}} in physical pixels.
     *
     * @param activity The current activity
     * @param promise Promise to resolve with the result map
     */
    public void isScrollable(Activity activity, Promise promise) {
        if (activity == null) {
            if (SCROLL_DEBUG) {
                Log.d(TAG, "isScrollable: No activity");
            }
            WritableMap noResult = Arguments.createMap();
            noResult.putBoolean("scrollable", false);
            promise.resolve(noResult);
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                WritableMap result = detectScrollableView(activity);
                promise.resolve(result);
            } catch (Exception e) {
                if (SCROLL_DEBUG) {
                    Log.e(TAG, "isScrollable exception", e);
                }
                WritableMap noResult = Arguments.createMap();
                noResult.putBoolean("scrollable", false);
                promise.resolve(noResult);
            }
        });
    }

    // ============ Checkpoint Scrolling ============

    /**
     * Deterministically scrolls to a checkpoint index.
     *
     * @param index The checkpoint index (0-based)
     * @param offset The vertical offset per checkpoint (in pixels)
     * @param maxIndex The maximum allowed index
     */
    public void scrollToCheckpoint(Activity activity, double index, double offset, double maxIndex, Promise promise) {
        if (activity == null) {
            promise.resolve(createScrollResult(true, 0, 0, 0, 0, null));
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                WritableMap result = performScrollToCheckpoint(activity, (int)index, (int)offset, (int)maxIndex);
                promise.resolve(result);
            } catch (Exception e) {
                if (SCROLL_DEBUG) {
                    Log.e(TAG, "scrollToCheckpoint exception", e);
                }
                promise.resolve(createScrollResult(true, 0, 0, 0, 0, null));
            }
        });
    }

    private WritableMap performScrollToCheckpoint(Activity activity, int index, int offsetPx, int maxIndex) {
        // 1. Use locked scroll view from isScrollable() - no re-detection
        View candidate = lockedScrollView;

        if (candidate == null || candidate.getWindowToken() == null) {
            if (SCROLL_DEBUG) {
                Log.d(TAG, "scrollToCheckpoint: No locked candidate found");
            }
            return createScrollResult(true, 0, 0, 0, 0, null);
        }

        // Suppress scroll indicators for the duration of testing
        candidate.setVerticalScrollBarEnabled(false);
        candidate.setHorizontalScrollBarEnabled(false);

        // 2. Compute Metrics
        int viewportPx = candidate.getHeight();

        int range = getScrollRangeViaReflection(candidate);
        if (range <= 0) {
            if (SCROLL_DEBUG) {
                Log.d(TAG, "scrollToCheckpoint: Could not determine scroll range");
            }
        }

        int extent = getScrollExtentViaReflection(candidate);
        if (extent <= 0) extent = viewportPx;

        int maxOffsetPx = Math.max(0, range - extent);
        int minOffsetPx = 0;

        // 3. Calculate Target
        int clampedIndex = index;
        if (clampedIndex < 0) clampedIndex = 0;
        if (clampedIndex > maxIndex) clampedIndex = maxIndex;

        int targetPx;
        if (clampedIndex == 0) {
            targetPx = minOffsetPx;
        } else {
            targetPx = minOffsetPx + (clampedIndex * offsetPx);
        }

        int clampedPx = Math.max(minOffsetPx, Math.min(maxOffsetPx, targetPx));

        // 4. Apply Scroll
        int currentOffset = getScrollOffsetViaReflection(candidate);
        int delta = clampedPx - currentOffset;

        if (SCROLL_DEBUG) {
            Log.d(TAG, "scrollToCheckpoint: index=" + clampedIndex + ", target=" + targetPx + ", clamped=" + clampedPx + ", current=" + currentOffset + ", delta=" + delta);
        }

        if (Math.abs(delta) > 0) {
            scrollViewBy(candidate, delta);
        }

        // 5. Read Back
        int actualOffsetPx = getScrollOffsetViaReflection(candidate);

        // 6. Detect Bottom
        boolean reachedBottom = false;
        if (actualOffsetPx >= maxOffsetPx - EPSILON) {
            reachedBottom = true;
        }
        if (maxOffsetPx <= EPSILON) {
            reachedBottom = true;
        }

        WritableMap frame = getScrollViewFrameInPixels(candidate);
        return createScrollResult(reachedBottom, clampedIndex, actualOffsetPx, viewportPx, range, frame);
    }

    private WritableMap createScrollResult(boolean reachedBottom, int appliedIndex, int appliedOffsetPx, int viewportPx, int contentPx, WritableMap scrollViewFrame) {
        WritableMap map = Arguments.createMap();
        map.putBoolean("reachedBottom", reachedBottom);
        map.putInt("appliedIndex", appliedIndex);
        map.putInt("appliedOffsetPx", appliedOffsetPx);
        map.putInt("viewportPx", viewportPx);
        map.putInt("contentPx", contentPx);
        if (scrollViewFrame != null) {
            map.putMap("scrollViewFrame", scrollViewFrame);
        }
        return map;
    }

    /**
     * Get vertical scroll extent using reflection since the method is protected.
     */
    private int getScrollExtentViaReflection(View view) {
        try {
            java.lang.reflect.Method method = View.class.getDeclaredMethod("computeVerticalScrollExtent");
            method.setAccessible(true);
            return (Integer) method.invoke(view);
        } catch (Exception e) {
            if (SCROLL_DEBUG) {
                Log.d(TAG, "Failed to get scroll extent via reflection: " + e.getMessage());
            }
            return -1;
        }
    }

    /**
     * Main detection logic for scrollable views. Returns map with scrollable + optional scrollViewFrame.
     */
    private WritableMap detectScrollableView(Activity activity) {
        View decorView = activity.getWindow().getDecorView();
        WritableMap noResult = Arguments.createMap();
        noResult.putBoolean("scrollable", false);

        if (decorView == null) {
            if (SCROLL_DEBUG) {
                Log.d(TAG, "isScrollable: No decor view");
            }
            return noResult;
        }

        // Reset lock for each new story detection
        lockedScrollView = null;

        // BFS from root to find the best user-facing scrollable view
        View candidate = findBestScrollViewBFS(decorView);

        if (candidate == null) {
            if (SCROLL_DEBUG) {
                Log.d(TAG, "isScrollable: No scrollable candidate found");
            }
            return noResult;
        }

        if (SCROLL_DEBUG) {
            Log.d(TAG, "isScrollable: Candidate found via BFS, class: " + candidate.getClass().getSimpleName());
        }

        // Suppress scroll indicators for the duration of testing
        candidate.setVerticalScrollBarEnabled(false);
        candidate.setHorizontalScrollBarEnabled(false);

        boolean scrollable = isScrollableByMetrics(candidate);

        if (!scrollable) {
            scrollable = validateWithNudge(candidate);
            if (SCROLL_DEBUG) {
                Log.d(TAG, "isScrollable: Nudge validation result: " + scrollable);
            }
        } else {
            if (SCROLL_DEBUG) {
                Log.d(TAG, "isScrollable: Metric check passed");
            }
        }

        if (!scrollable) {
            return noResult;
        }

        // Lock the candidate for reuse in scrollToCheckpoint()
        lockedScrollView = candidate;

        WritableMap frame = getScrollViewFrameInPixels(candidate);
        WritableMap result = Arguments.createMap();
        result.putBoolean("scrollable", true);
        result.putMap("scrollViewFrame", frame);
        return result;
    }

    /**
     * BFS traversal from root to find the largest user-facing vertically-scrollable view.
     * Filters out framework-internal views and views covering < 10% of screen.
     */
    private View findBestScrollViewBFS(View root) {
        int screenWidth = root.getWidth();
        int screenHeight = root.getHeight();
        int screenArea = screenWidth * screenHeight;
        int minArea = screenArea / 10; // 10% threshold

        View bestCandidate = null;
        int bestArea = 0;

        java.util.LinkedList<View> queue = new java.util.LinkedList<>();
        queue.add(root);

        while (!queue.isEmpty()) {
            View view = queue.poll();

            if (view.canScrollVertically(1) || view.canScrollVertically(-1)) {
                if (view.getVisibility() == View.VISIBLE && !isFrameworkInternalScrollView(view)) {
                    android.graphics.Rect rect = new android.graphics.Rect();
                    if (view.getGlobalVisibleRect(rect)) {
                        int area = rect.width() * rect.height();
                        if (area >= minArea && isScrollableByMetrics(view) && area > bestArea) {
                            bestArea = area;
                            bestCandidate = view;
                        }
                    }
                }
            }

            if (view instanceof android.view.ViewGroup) {
                android.view.ViewGroup group = (android.view.ViewGroup) view;
                for (int i = 0; i < group.getChildCount(); i++) {
                    queue.add(group.getChildAt(i));
                }
            }
        }

        return bestCandidate;
    }

    /**
     * Returns true if the view is a framework-internal view that should not be used as a scroll target.
     */
    private boolean isFrameworkInternalScrollView(View view) {
        String className = view.getClass().getName();
        // Android internal framework classes
        if (className.startsWith("com.android.internal.")) {
            return true;
        }
        return false;
    }

    /**
     * Returns the scroll view's frame in physical pixels (global screen coordinates).
     */
    private WritableMap getScrollViewFrameInPixels(View view) {
        android.graphics.Rect rect = new android.graphics.Rect();
        view.getGlobalVisibleRect(rect);
        WritableMap frame = Arguments.createMap();
        frame.putInt("x", rect.left);
        frame.putInt("y", rect.top);
        frame.putInt("width", rect.width());
        frame.putInt("height", rect.height());
        return frame;
    }

    /**
     * Metric-based check for scrollability.
     */
    private boolean isScrollableByMetrics(View view) {
        // Basic scrollability check using public API
        if (!(view.canScrollVertically(1) || view.canScrollVertically(-1))) {
            return false;
        }

        if (view.getVisibility() != View.VISIBLE) {
            return false;
        }

        // Use view height as extent (viewport height)
        int extent = view.getHeight();
        
        // Try to get scroll range using reflection since computeVerticalScrollRange is protected
        int range = getScrollRangeViaReflection(view);
        
        // If reflection failed, estimate based on canScrollVertically
        // A view that can scroll in both directions has significant content
        if (range <= 0) {
            boolean canScrollDown = view.canScrollVertically(1);
            boolean canScrollUp = view.canScrollVertically(-1);
            
            if (SCROLL_DEBUG) {
                Log.d(TAG, "Scroll metrics (fallback) - canScrollDown: " + canScrollDown + ", canScrollUp: " + canScrollUp);
            }
            
            // If we can scroll in any direction, assume it's scrollable
            return canScrollDown || canScrollUp;
        }
        
        int scrollRange = range - extent;

        if (SCROLL_DEBUG) {
            Log.d(TAG, "Scroll metrics - range: " + range + ", extent: " + extent + ", scrollRange: " + scrollRange);
        }

        if (extent <= 0) {
            return false;
        }

        if (scrollRange <= EPSILON) {
            return false;
        }

        // Check for meaningful scroll range (at least MIN_SCROLL_RANGE_RATIO of viewport)
        float minRange = extent * MIN_SCROLL_RANGE_RATIO;
        if (scrollRange < minRange) {
            if (SCROLL_DEBUG) {
                Log.d(TAG, "Scroll range " + scrollRange + " < minimum " + minRange + " (" + (MIN_SCROLL_RANGE_RATIO * 100) + "% of viewport)");
            }
            return false;
        }

        return true;
    }

    /**
     * Get vertical scroll range using reflection since the method is protected.
     */
    private int getScrollRangeViaReflection(View view) {
        try {
            java.lang.reflect.Method method = View.class.getDeclaredMethod("computeVerticalScrollRange");
            method.setAccessible(true);
            return (Integer) method.invoke(view);
        } catch (Exception e) {
            if (SCROLL_DEBUG) {
                Log.d(TAG, "Failed to get scroll range via reflection: " + e.getMessage());
            }
            return -1;
        }
    }

    /**
     * Get vertical scroll offset using reflection since the method is protected.
     */
    private int getScrollOffsetViaReflection(View view) {
        try {
            java.lang.reflect.Method method = View.class.getDeclaredMethod("computeVerticalScrollOffset");
            method.setAccessible(true);
            return (Integer) method.invoke(view);
        } catch (Exception e) {
            if (SCROLL_DEBUG) {
                Log.d(TAG, "Failed to get scroll offset via reflection: " + e.getMessage());
            }
            // Fallback to getScrollY
            return view.getScrollY();
        }
    }

    /**
     * Validate control by tiny nudge + restore.
     */
    private boolean validateWithNudge(View view) {
        int originalScrollY = view.getScrollY();
        int originalOffset = getScrollOffsetViaReflection(view);
        int nudgePx = (int) NUDGE_PX;

        // Try scrolling down first
        scrollViewBy(view, nudgePx);

        int newScrollY = view.getScrollY();
        int newOffset = getScrollOffsetViaReflection(view);

        // Restore
        scrollViewBy(view, -(newScrollY - originalScrollY));

        int delta = Math.abs(newOffset - originalOffset);
        int deltaScrollY = Math.abs(newScrollY - originalScrollY);

        if (SCROLL_DEBUG) {
            Log.d(TAG, "Nudge: originalScrollY=" + originalScrollY + ", newScrollY=" + newScrollY + 
                       ", originalOffset=" + originalOffset + ", newOffset=" + newOffset + 
                       ", delta=" + delta + ", deltaScrollY=" + deltaScrollY);
        }

        // Check both scrollY and computed offset
        boolean moved = delta >= 1 || deltaScrollY >= 1;

        // If we couldn't scroll down, try scrolling up
        if (!moved) {
            scrollViewBy(view, -nudgePx);
            newScrollY = view.getScrollY();
            newOffset = getScrollOffsetViaReflection(view);
            
            // Restore
            scrollViewBy(view, -(newScrollY - originalScrollY));
            
            delta = Math.abs(newOffset - originalOffset);
            deltaScrollY = Math.abs(newScrollY - originalScrollY);
            moved = delta >= 1 || deltaScrollY >= 1;
            
            if (SCROLL_DEBUG) {
                Log.d(TAG, "Nudge (reverse): deltaScrollY=" + deltaScrollY + ", delta=" + delta + ", moved=" + moved);
            }
        }

        return moved;
    }

    /**
     * Scroll a view by the given amount using the appropriate method.
     * Uses reflection for optional dependencies (RecyclerView, NestedScrollView) to avoid compile-time dependency.
     */
    private void scrollViewBy(View view, int dy) {
        if (view instanceof android.widget.ScrollView) {
            ((android.widget.ScrollView) view).scrollBy(0, dy);
            return;
        }
        
        if (view instanceof android.webkit.WebView) {
            ((android.webkit.WebView) view).scrollBy(0, dy);
            return;
        }
        
        // Try NestedScrollView via reflection (optional dependency)
        if (tryScrollByClassName(view, "androidx.core.widget.NestedScrollView", dy)) {
            return;
        }
        
        // Try RecyclerView via reflection (optional dependency)
        if (tryScrollByClassName(view, "androidx.recyclerview.widget.RecyclerView", dy)) {
            return;
        }
        
        // Generic fallback - use View.scrollBy which is always available
        view.scrollBy(0, dy);
    }

    /**
     * Try to scroll a view if it matches the given class name using reflection.
     * Returns true if the scroll was attempted (class matched), false otherwise.
     */
    private boolean tryScrollByClassName(View view, String className, int dy) {
        try {
            Class<?> clazz = Class.forName(className);
            if (clazz.isInstance(view)) {
                view.scrollBy(0, dy);
                return true;
            }
        } catch (ClassNotFoundException e) {
            // Class not available, skip
        }
        return false;
    }
} 