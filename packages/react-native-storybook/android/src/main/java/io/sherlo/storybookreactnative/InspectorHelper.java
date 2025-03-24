package io.sherlo.storybookreactnative;

import android.app.Activity;
import android.graphics.Rect;
import android.graphics.drawable.ColorDrawable;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import com.facebook.react.bridge.Promise;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Helper for inspecting the UI view hierarchy of a React Native application.
 * Provides functionality to collect information about views and their properties.
 */
public class InspectorHelper {
    private static final String TAG = "InspectorHelper";
    
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
                handleError("ERROR_INSPECTOR_DATA", e, promise, e.getMessage());
            }
        });
    }
    
    /**
     * Handles errors by logging them and rejecting the promise with appropriate messages.
     *
     * @param errorCode The error code to include in the promise rejection
     * @param e The exception that occurred
     * @param promise The promise to reject
     * @param message The error message
     */
    private static void handleError(String errorCode, Exception e, Promise promise, String message) {
        Log.e(TAG, message, e);
        promise.reject(errorCode.toLowerCase(), message, e);
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
        
        // List to hold all view information
        List<JSONObject> viewList = new ArrayList<>();

        // Traverse and collect view information
        collectViewInfo(rootView, viewList);

        // Create the root JSON object
        JSONObject rootObject = new JSONObject();
        rootObject.put("density", resources.getDisplayMetrics().density);
        rootObject.put("fontScale", resources.getConfiguration().fontScale);
        rootObject.put("viewInfo", new JSONArray(viewList));

        return rootObject.toString();
    }

    /**
     * Recursively collects information about a view and its children.
     * Extracts properties like position, size, visibility, text content, and styling.
     *
     * @param view The view to collect information from
     * @param viewList The list to add view information objects to
     * @throws JSONException If there's an error creating the JSON structure
     */
    private static void collectViewInfo(View view, List<JSONObject> viewList) throws JSONException {
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

        // Tag (optional)
        Object tag = view.getTag();
        if (tag != null) {
            viewObject.put("tag", tag.toString());
        }

        // Content Description (optional)
        CharSequence contentDescription = view.getContentDescription();
        if (contentDescription != null) {
            viewObject.put("contentDescription", contentDescription.toString());
        }

        // Enhanced Background Color detection
        int backgroundColor = getBackgroundColor(view);
        if (backgroundColor != 0) {
            String hexColor = String.format("#%08X", backgroundColor); // Using 8 digits for ARGB
            viewObject.put("backgroundColor", hexColor);
        }

        // Text and Font information (for TextView and its subclasses)
        if (view instanceof TextView) {
            TextView textView = (TextView) view;
            CharSequence text = textView.getText();
            if (text != null) {
                viewObject.put("text", text.toString());
            }

            // Create font object to hold all font-related properties
            JSONObject fontObject = new JSONObject();
            fontObject.put("size", textView.getTextSize());
            fontObject.put("color", String.format("#%08X", textView.getCurrentTextColor()));
            
            if (textView.getTypeface() != null) {
                fontObject.put("isBold", textView.getTypeface().isBold());
                fontObject.put("isItalic", textView.getTypeface().isItalic());
                fontObject.put("style", textView.getTypeface().getStyle());
            }

            fontObject.put("alignment", textView.getTextAlignment());
            fontObject.put("lineSpacingExtra", textView.getLineSpacingExtra());
            fontObject.put("lineSpacingMultiplier", textView.getLineSpacingMultiplier());
            
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
                fontObject.put("letterSpacing", textView.getLetterSpacing());
            }

            viewObject.put("font", fontObject);
        }

        viewList.add(viewObject);

        // If the view is a ViewGroup, recurse
        if (view instanceof ViewGroup) {
            ViewGroup viewGroup = (ViewGroup) view;
            for (int i = 0; i < viewGroup.getChildCount(); i++) {
                collectViewInfo(viewGroup.getChildAt(i), viewList);
            }
        }
    }

    /**
     * Detects the background color of a view.
     * Handles both React Native views and native Android views with different detection strategies.
     *
     * @param view The view to extract background color from
     * @return The background color as an integer, or 0 if no color could be detected
     */
    private static int getBackgroundColor(View view) {
        int color = 0;
        
        // Check if it's a React Native view
        if (view.getClass().getName().startsWith("com.facebook.react")) {
            // Try to get the background color from the view's background
            if (view.getBackground() instanceof ColorDrawable) {
                color = ((ColorDrawable) view.getBackground()).getColor();
            }
            
            // For React Native views, check if there's a background color property
            Object backgroundColor = view.getTag(com.facebook.react.R.id.view_tag_native_id);
            if (backgroundColor instanceof Integer) {
                color = (Integer) backgroundColor;
            }
        } else {
            // Original native Android view handling
            if (view.getBackground() instanceof ColorDrawable) {
                color = ((ColorDrawable) view.getBackground()).getColor();
            }
            
            if (color == 0) {
                try {
                    color = view.getSolidColor();
                } catch (Exception ignored) {}
            }
            
            if (color == 0 && view.getBackgroundTintList() != null) {
                color = view.getBackgroundTintList().getDefaultColor();
            }
        }
        
        return color;
    }
}
