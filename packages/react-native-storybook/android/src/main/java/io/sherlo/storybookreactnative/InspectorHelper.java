package io.sherlo.storybookreactnative;

import android.app.Activity;
import android.graphics.Rect;
import android.graphics.drawable.ColorDrawable;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public class InspectorHelper {
    private static final String TAG = "InspectorHelper";

    public static String getInspectorData(Activity activity) throws JSONException {
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

    private static void collectViewInfo(View view, List<JSONObject> viewList) throws JSONException {
        JSONObject viewObject = new JSONObject();


        // Class name
        String className = view.getClass().getSimpleName();
        viewObject.put("className", className);

        // Check visibility
        Rect rect = new Rect();
        boolean isVisible = view.getGlobalVisibleRect(rect);
        viewObject.put("isVisible", isVisible);

        if (isVisible) {
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

            // Text and Font Size (for TextView and its subclasses)
            if (view instanceof TextView) {
                TextView textView = (TextView) view;
                CharSequence text = textView.getText();
                if (text != null) {
                    viewObject.put("text", text.toString());
                }
                viewObject.put("fontSize", textView.getTextSize());
            }
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

    private static int getBackgroundColor(View view) {
        int color = 0;
        
        // Try getting color from background drawable
        if (view.getBackground() instanceof ColorDrawable) {
            color = ((ColorDrawable) view.getBackground()).getColor();
        }
        
        // If no color found, try getting solid color
        if (color == 0) {
            try {
                color = view.getSolidColor();
            } catch (Exception ignored) {}
        }
        
        // Try getting background tint color
        if (color == 0 && view.getBackgroundTintList() != null) {
            color = view.getBackgroundTintList().getDefaultColor();
        }
        
        return color;
    }
}
