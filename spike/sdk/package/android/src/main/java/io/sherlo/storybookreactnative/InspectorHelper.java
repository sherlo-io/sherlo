package io.sherlo.storybookreactnative;

import android.app.Activity;
import android.graphics.Rect;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import com.facebook.react.bridge.Promise;
import com.facebook.react.R;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;


/**
 * Helper for inspecting the UI view hierarchy of a React Native application.
 * Provides functionality to collect information about views and their properties.
 */
public class InspectorHelper {
    private static final String TAG = "SherloModule:InspectorHelper";
    private static final int MAX_DEPTH = 50;
    private static final int MAX_NODES = 10000;

    /**
     * Gets UI inspector data from the current view hierarchy.
     * Runs the data collection on the UI thread and returns a serialized JSON string.
     *
     * @param activity The current activity containing the view hierarchy
     * @param promise Promise to resolve with the inspector data or reject with an error
     */
    public static void getInspectorData(Activity activity, Promise promise) {
        if (activity == null) {
            promise.reject("no_activity", "No current activity");
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                String jsonString = getInspectorDataString(activity);
                promise.resolve(jsonString);
            } catch (Exception e) {
                Log.e(TAG, e.getMessage(), e);
                promise.reject("ERROR_INSPECTOR_DATA", e.getMessage(), e);
            }
        });
    }

    /**
     * Collects and serializes data about the view hierarchy.
     * Creates a JSON object with device metrics and detailed view information.
     * Only traverses views that intersect the current screen viewport for performance.
     *
     * @param activity The activity containing the view hierarchy
     * @return JSON string representing the view hierarchy and device metrics
     * @throws JSONException If there's an error creating the JSON structure
     */
    private static String getInspectorDataString(Activity activity) throws JSONException {
        View rootView = activity.getWindow().getDecorView().getRootView();
        android.content.res.Resources resources = rootView.getResources();

        // Determine the visible viewport bounds (screen coordinates)
        Rect screenRect = new Rect();
        rootView.getWindowVisibleDisplayFrame(screenRect);
        int viewportTop = screenRect.top;
        int viewportBottom = screenRect.bottom;

        // Get hierarchical view structure, clipped to viewport
        int[] nodeCount = {0};
        JSONObject viewHierarchy = collectViewHierarchy(rootView, 0, nodeCount, viewportTop, viewportBottom);

        // Create the root JSON object
        JSONObject rootObject = new JSONObject();
        rootObject.put("density", resources.getDisplayMetrics().density);
        rootObject.put("fontScale", resources.getConfiguration().fontScale);
        rootObject.put("viewHierarchy", viewHierarchy);

        return rootObject.toString();
    }

    /**
     * Collects information about a view and its children in a hierarchical structure.
     * Only includes children whose bounds intersect the viewport [viewportTop, viewportBottom].
     * Parent containers that span beyond the viewport are always included (they intersect it),
     * but their off-screen children are skipped.
     *
     * @param view The view to collect information from
     * @param depth Current recursion depth
     * @param nodeCount Mutable counter tracking total nodes collected (single-element array)
     * @param viewportTop Top edge of the visible viewport in screen coordinates
     * @param viewportBottom Bottom edge of the visible viewport in screen coordinates
     * @return A JSON object representing the view and its children
     * @throws JSONException If there's an error creating the JSON structure
     */
    private static JSONObject collectViewHierarchy(View view, int depth, int[] nodeCount, int viewportTop, int viewportBottom) throws JSONException {
        nodeCount[0]++;

        JSONObject viewObject = new JSONObject();

        // Class name
        String className = view.getClass().getSimpleName();
        viewObject.put("className", className);

        // Check visibility
        Rect rect = new Rect();
        boolean isVisible = view.getGlobalVisibleRect(rect);
        viewObject.put("isVisible", isVisible);

        // Position on screen
        viewObject.put("x", rect.left);
        viewObject.put("y", rect.top);

        // Dimensions
        viewObject.put("width", rect.width());
        viewObject.put("height", rect.height());

        // Native ID
        int nativeTag = view.getId();
        if (nativeTag > 0) {
            viewObject.put("id", nativeTag);
        }

        // Add children array for hierarchical structure
        // Skip children if we hit depth or node count limits
        // Skip children whose bounds are entirely outside the viewport
        JSONArray children = new JSONArray();
        if (view instanceof ViewGroup && depth < MAX_DEPTH && nodeCount[0] < MAX_NODES) {
            ViewGroup viewGroup = (ViewGroup) view;
            for (int i = 0; i < viewGroup.getChildCount(); i++) {
                if (nodeCount[0] >= MAX_NODES) {
                    break;
                }

                View child = viewGroup.getChildAt(i);

                // Get child's position in screen coordinates
                int[] childLocation = new int[2];
                child.getLocationOnScreen(childLocation);
                int childTop = childLocation[1];
                int childBottom = childTop + child.getHeight();

                // Skip children entirely outside the viewport
                // A view intersects if: viewTop < viewportBottom && viewBottom > viewportTop
                if (childBottom <= viewportTop || childTop >= viewportBottom) {
                    continue;
                }

                children.put(collectViewHierarchy(child, depth + 1, nodeCount, viewportTop, viewportBottom));
            }
        }
        viewObject.put("children", children);

        return viewObject;
    }
}
