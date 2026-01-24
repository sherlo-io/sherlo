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

    /**
     * Detects if the currently visible screen can be vertically scrolled for long-screenshot capture.
     * Uses read-only view inspection: finds a primary scroll container, checks scroll metrics,
     * and validates with a small programmatic nudge that is immediately restored.
     *
     * @param activity The current activity
     * @param promise Promise to resolve with boolean (true if scrollable, false otherwise)
     */
    public void isScrollableSnapshot(Activity activity, Promise promise) {
        if (activity == null) {
            if (SCROLL_DEBUG) {
                Log.d(TAG, "isScrollableSnapshot: No activity");
            }
            promise.resolve(false);
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                boolean result = detectScrollableView(activity);
                promise.resolve(result);
            } catch (Exception e) {
                if (SCROLL_DEBUG) {
                    Log.e(TAG, "isScrollableSnapshot exception", e);
                }
                promise.resolve(false);
            }
        });
    }

    /**
     * Main detection logic for scrollable views.
     */
    private boolean detectScrollableView(Activity activity) {
        View decorView = activity.getWindow().getDecorView();
        if (decorView == null) {
            if (SCROLL_DEBUG) {
                Log.d(TAG, "isScrollableSnapshot: No decor view");
            }
            return false;
        }

        // Try probe-based detection first
        View candidate = findScrollableViewViaProbe(decorView);
        String selectionMethod = "probe-deepest";

        // Fallback to largest visible scrollable view
        if (candidate == null) {
            candidate = findLargestVisibleScrollableView(decorView);
            selectionMethod = "fallback-largest";
        }

        if (candidate == null) {
            if (SCROLL_DEBUG) {
                Log.d(TAG, "isScrollableSnapshot: No scrollable candidate found");
            }
            return false;
        }

        if (SCROLL_DEBUG) {
            Log.d(TAG, "isScrollableSnapshot: Candidate found via " + selectionMethod + ", class: " + candidate.getClass().getSimpleName());
        }

        // Metric-based scrollability check
        if (!isScrollableByMetrics(candidate)) {
            if (SCROLL_DEBUG) {
                Log.d(TAG, "isScrollableSnapshot: Failed metric check");
            }
            return false;
        }

        // Control validation: nudge and restore
        boolean nudgeResult = validateWithNudge(candidate);
        if (SCROLL_DEBUG) {
            Log.d(TAG, "isScrollableSnapshot: Nudge validation result: " + nudgeResult);
        }

        return nudgeResult;
    }

    /**
     * Find scrollable view using coordinate probe + deepest view at point.
     */
    private View findScrollableViewViaProbe(View root) {
        int rootWidth = root.getWidth();
        int rootHeight = root.getHeight();

        // Probe point: 50% width, 55% height (slightly below center to avoid nav headers)
        int probeX = (int) (rootWidth * 0.5f);
        int probeY = (int) (rootHeight * 0.55f);

        View deepest = findDeepestViewAt(root, probeX, probeY);
        if (deepest == null) {
            // Try secondary probe at 70% height
            probeY = (int) (rootHeight * 0.70f);
            deepest = findDeepestViewAt(root, probeX, probeY);
        }

        if (deepest == null) {
            return null;
        }

        // Walk up parent chain to find scrollable view
        View current = deepest;
        while (current != null) {
            if (current.canScrollVertically(1) || current.canScrollVertically(-1)) {
                return current;
            }
            if (current.getParent() instanceof View) {
                current = (View) current.getParent();
            } else {
                break;
            }
        }

        return null;
    }

    /**
     * Find the deepest view at the given coordinates.
     */
    private View findDeepestViewAt(View parent, int x, int y) {
        if (!(parent instanceof android.view.ViewGroup)) {
            android.graphics.Rect rect = new android.graphics.Rect();
            if (parent.getGlobalVisibleRect(rect) && rect.contains(x, y)) {
                return parent;
            }
            return null;
        }

        android.view.ViewGroup group = (android.view.ViewGroup) parent;
        
        // Traverse children in reverse order (top-most first)
        for (int i = group.getChildCount() - 1; i >= 0; i--) {
            View child = group.getChildAt(i);
            if (child.getVisibility() != View.VISIBLE) {
                continue;
            }

            android.graphics.Rect rect = new android.graphics.Rect();
            if (child.getGlobalVisibleRect(rect) && rect.contains(x, y)) {
                View found = findDeepestViewAt(child, x, y);
                if (found != null) {
                    return found;
                }
                return child;
            }
        }

        android.graphics.Rect parentRect = new android.graphics.Rect();
        if (parent.getGlobalVisibleRect(parentRect) && parentRect.contains(x, y)) {
            return parent;
        }

        return null;
    }

    /**
     * Fallback: Find the largest visible scrollable view in the hierarchy.
     */
    private View findLargestVisibleScrollableView(View root) {
        final View[] bestCandidate = {null};
        final int[] bestArea = {0};

        traverseViewHierarchy(root, view -> {
            if (!(view.canScrollVertically(1) || view.canScrollVertically(-1))) {
                return;
            }

            if (view.getVisibility() != View.VISIBLE) {
                return;
            }

            android.graphics.Rect rect = new android.graphics.Rect();
            if (!view.getGlobalVisibleRect(rect)) {
                return;
            }

            int area = rect.width() * rect.height();
            if (area > bestArea[0]) {
                bestArea[0] = area;
                bestCandidate[0] = view;
            }
        });

        return bestCandidate[0];
    }

    /**
     * Traverse view hierarchy recursively.
     */
    private void traverseViewHierarchy(View view, java.util.function.Consumer<View> visitor) {
        visitor.accept(view);
        if (view instanceof android.view.ViewGroup) {
            android.view.ViewGroup group = (android.view.ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                traverseViewHierarchy(group.getChildAt(i), visitor);
            }
        }
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