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
     *
     * @param activity The activity containing the view hierarchy
     * @return JSON string representing the view hierarchy and device metrics
     * @throws JSONException If there's an error creating the JSON structure
     */
    private static String getInspectorDataString(Activity activity) throws JSONException {
        View rootView = activity.getWindow().getDecorView().getRootView();
        android.content.res.Resources resources = rootView.getResources();
        
        // Get hierarchical view structure instead of flat list
        JSONObject viewHierarchy = collectViewHierarchy(rootView);

        // Create the root JSON object
        JSONObject rootObject = new JSONObject();
        rootObject.put("density", resources.getDisplayMetrics().density);
        rootObject.put("fontScale", resources.getConfiguration().fontScale);
        rootObject.put("viewHierarchy", viewHierarchy);
        
        return rootObject.toString();
    }

    /**
     * Collects information about a view and its children in a hierarchical structure.
     *
     * @param view The view to collect information from
     * @return A JSON object representing the view and its children
     * @throws JSONException If there's an error creating the JSON structure
     */
    private static JSONObject collectViewHierarchy(View view) throws JSONException {
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
        JSONArray children = new JSONArray();
        if (view instanceof ViewGroup) {
            ViewGroup viewGroup = (ViewGroup) view;
            for (int i = 0; i < viewGroup.getChildCount(); i++) {
                children.put(collectViewHierarchy(viewGroup.getChildAt(i)));
            }
        }
        viewObject.put("children", children);

        return viewObject;
    }
}
