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
import java.util.Iterator;
import java.util.List;

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

        // TODO: Add properties based on class
        JSONObject properties = new JSONObject();
        collectViewProperties(view, properties);
        viewObject.put("properties", properties);

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

    /**
     * Collects properties based on the view's class type.
     * 
     * @param view The view to extract properties from
     * @param properties The JSON object to store properties in
     * @throws JSONException If there's an error creating the JSON structure
     */
    private static void collectViewProperties(View view, JSONObject properties) throws JSONException {
        // Common properties for all views
        collectCommonViewProperties(view, properties);
        
        String className = view.getClass().getSimpleName();
        
        // Check specific view types
        if (className.contains("ReactTextView")) {
            collectReactTextViewProperties(view, properties);
        } else if (className.contains("ReactImageView")) {
            collectReactImageViewProperties(view, properties);
        } else if (className.contains("ReactEditText")) {
            collectReactEditTextProperties(view, properties);
        } else if (className.contains("ReactScrollView") || className.contains("ReactHorizontalScrollView")) {
            collectReactScrollViewProperties(view, properties);
        } else if (className.contains("ReactSwitch")) {
            collectReactSwitchProperties(view, properties);
        } else if (view instanceof ViewGroup && className.contains("ReactViewGroup")) {
            collectReactViewGroupProperties((ViewGroup)view, properties);
        }
    }
    
    /**
     * Collects common properties available on all views.
     *
     * @param view The view to extract properties from
     * @param properties The JSON object to store properties in
     * @throws JSONException If there's an error creating the JSON structure
     */
    private static void collectCommonViewProperties(View view, JSONObject properties) throws JSONException {
        // Content Description
        CharSequence contentDescription = view.getContentDescription();
        if (contentDescription != null) {
            viewObject.put("contentDescription", contentDescription.toString());
        }

        // Background color
        if (view.getBackground() instanceof ColorDrawable) {
            int backgroundColor = ((ColorDrawable)view.getBackground()).getColor();
            properties.put("backgroundColor", String.format("#%08X", backgroundColor));
        }
        
        // Opacity/alpha
        float alpha = view.getAlpha();
        properties.put("opacity", alpha);
        
        // Elevation (for API 21+)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
            properties.put("elevation", view.getElevation());
        }
        
        // Transform properties
        properties.put("rotation", view.getRotation());
        properties.put("scaleX", view.getScaleX());
        properties.put("scaleY", view.getScaleY());
        
        // Test ID (often stored as content description or tag)
        if (view.getContentDescription() != null) {
            properties.put("testID", view.getContentDescription().toString());
        }
        
        // Add accessibility properties
        JSONObject accessibilityProps = new JSONObject();
        collectAccessibilityProperties(view, accessibilityProps);
        if (accessibilityProps.length() > 0) {
            properties.put("accessibility", accessibilityProps);
        }
    }
    
    /**
     * Collects accessibility-related properties.
     *
     * @param view The view to extract properties from
     * @param properties The JSON object to store properties in
     * @throws JSONException If there's an error creating the JSON structure
     */
    private static void collectAccessibilityProperties(View view, JSONObject properties) throws JSONException {
        // Content description (equivalent to accessibilityLabel)
        if (view.getContentDescription() != null) {
            properties.put("accessibilityLabel", view.getContentDescription().toString());
        }
        
        // Is accessible (focusable by screen readers)
        int importanceForA11y = view.getImportantForAccessibility();
        properties.put("accessible", importanceForA11y != View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        
        // Important for accessibility
        properties.put("importantForAccessibility", view.getImportantForAccessibility());
        
        // Is focusable
        properties.put("focusable", view.isFocusable());
        
        // Accessibility hint (if available)
        try {
            // Try to access accessibility hint via reflection
            java.lang.reflect.Method getAccessibilityHintMethod = view.getClass().getMethod("getAccessibilityHint");
            if (getAccessibilityHintMethod != null) {
                Object hint = getAccessibilityHintMethod.invoke(view);
                if (hint != null) {
                    properties.put("accessibilityHint", hint.toString());
                }
            }
        } catch (Exception e) {
            // Method not available, skip
        }
        
        // Accessibility role (if available)
        try {
            // Try to access accessibility role via reflection
            java.lang.reflect.Method getAccessibilityRoleMethod = view.getClass().getMethod("getAccessibilityRole");
            if (getAccessibilityRoleMethod != null) {
                Object role = getAccessibilityRoleMethod.invoke(view);
                if (role != null) {
                    properties.put("accessibilityRole", role.toString());
                }
            }
        } catch (Exception e) {
            // Method not available, skip
        }
    }
    
    /**
     * Collects properties specific to ReactViewGroup.
     *
     * @param viewGroup The ViewGroup to extract properties from
     * @param properties The JSON object to store properties in
     * @throws JSONException If there's an error creating the JSON structure
     */
    private static void collectReactViewGroupProperties(ViewGroup viewGroup, JSONObject properties) throws JSONException {
        // Most view group properties are covered by the common properties
        // Additional properties like padding can be added here
        properties.put("paddingLeft", viewGroup.getPaddingLeft());
        properties.put("paddingTop", viewGroup.getPaddingTop());
        properties.put("paddingRight", viewGroup.getPaddingRight());
        properties.put("paddingBottom", viewGroup.getPaddingBottom());
    }
    
    /**
     * Collects properties specific to ReactTextView.
     *
     * @param view The view to extract properties from
     * @param properties The JSON object to store properties in
     * @throws JSONException If there's an error creating the JSON structure
     */
    private static void collectReactTextViewProperties(View view, JSONObject properties) throws JSONException {
        if (view instanceof TextView) {
            TextView textView = (TextView) view;
            
            // Text content
            properties.put("text", textView.getText().toString());
            
            // Text color
            properties.put("color", String.format("#%08X", textView.getCurrentTextColor()));
            
            // Font size (in pixels)
            properties.put("fontSize", textView.getTextSize());
            
            // Enhanced font properties extraction
            if (textView.getTypeface() != null) {
                int style = textView.getTypeface().getStyle();
                boolean isBold = (style & android.graphics.Typeface.BOLD) != 0;
                boolean isItalic = (style & android.graphics.Typeface.ITALIC) != 0;
                
                properties.put("fontWeight", isBold ? "bold" : "normal");
                properties.put("fontStyle", isItalic ? "italic" : "normal");
                
                // Try to extract font family
                try {
                    // Using reflection to access private field in ReactTextView that might contain font info
                    java.lang.reflect.Field mFontFamilyField = view.getClass().getDeclaredField("mFontFamily");
                    if (mFontFamilyField != null) {
                        mFontFamilyField.setAccessible(true);
                        String fontFamily = (String) mFontFamilyField.get(view);
                        if (fontFamily != null && !fontFamily.isEmpty()) {
                            properties.put("fontFamily", fontFamily);
                        }
                    }
                } catch (Exception e) {
                    // Fall back to basic font detection
                    if (textView.getTypeface() != null) {
                        properties.put("fontFamily", "system");
                    }
                }
            }
            
            // Text alignment
            int gravity = textView.getGravity();
            String textAlign = "start";
            if ((gravity & android.view.Gravity.CENTER_HORIZONTAL) != 0) {
                textAlign = "center";
            } else if ((gravity & android.view.Gravity.END) != 0) {
                textAlign = "end";
            }
            properties.put("textAlign", textAlign);
            
            // Line height
            properties.put("lineHeight", textView.getLineHeight());
            
            // Letter spacing (for API 21+)
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
                properties.put("letterSpacing", textView.getLetterSpacing());
            }
            
            // Max lines
            properties.put("numberOfLines", textView.getMaxLines());
            
            // Ellipsize
            if (textView.getEllipsize() != null) {
                properties.put("ellipsizeMode", textView.getEllipsize().toString());
            }
            
            // Selectable
            properties.put("selectable", textView.isTextSelectable());
        }
    }
    
    /**
     * Collects properties specific to ReactImageView.
     *
     * @param view The view to extract properties from
     * @param properties The JSON object to store properties in
     * @throws JSONException If there's an error creating the JSON structure
     */
    private static void collectReactImageViewProperties(View view, JSONObject properties) throws JSONException {
        // For ReactImageView, many properties are internal to Fresco DraweeView
        // We can extract what's accessible via the base View class
        
        try {
            // Try to access scaleType if available via reflection
            java.lang.reflect.Method getScaleTypeMethod = view.getClass().getMethod("getScaleType");
            Object scaleType = getScaleTypeMethod.invoke(view);
            properties.put("resizeMode", scaleType.toString());
        } catch (Exception e) {
            // Method not available, skip
        }
        
        // Tint color (for API 21+)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
            try {
                // Need to use a safer approach - not all Views have getImageTintList()
                // This method is available on ImageView subclasses
                if (view instanceof android.widget.ImageView) {
                    android.widget.ImageView imageView = (android.widget.ImageView) view;
                    if (imageView.getImageTintList() != null) {
                        properties.put("tintColor", String.format("#%08X", imageView.getImageTintList().getDefaultColor()));
                    }
                } else {
                    // Try to access via reflection as fallback
                    java.lang.reflect.Method getTintListMethod = view.getClass().getMethod("getImageTintList");
                    if (getTintListMethod != null) {
                        android.content.res.ColorStateList tintList = 
                            (android.content.res.ColorStateList) getTintListMethod.invoke(view);
                        if (tintList != null) {
                            properties.put("tintColor", String.format("#%08X", tintList.getDefaultColor()));
                        }
                    }
                }
            } catch (Exception e) {
                // Method not available or reflection failed, skip
            }
        }
    }
    
    /**
     * Collects properties specific to ReactEditText.
     *
     * @param view The view to extract properties from
     * @param properties The JSON object to store properties in
     * @throws JSONException If there's an error creating the JSON structure
     */
    private static void collectReactEditTextProperties(View view, JSONObject properties) throws JSONException {
        if (view instanceof TextView) {  // EditText extends TextView
            TextView editText = (TextView) view;
            
            // Text content
            properties.put("text", editText.getText().toString());
            
            // Placeholder
            if (editText.getHint() != null) {
                properties.put("placeholder", editText.getHint().toString());
            }
            
            // Placeholder color
            properties.put("placeholderTextColor", String.format("#%08X", editText.getCurrentHintTextColor()));
            
            // Selection color
            properties.put("selectionColor", String.format("#%08X", editText.getHighlightColor()));
            
            // Input type
            properties.put("keyboardType", editText.getInputType());
            
            // Secure text entry
            boolean isPassword = (editText.getInputType() & android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD) != 0;
            properties.put("secureTextEntry", isPassword);
            
            // Other text properties are inherited from TextView and will be included
            collectReactTextViewProperties(view, properties);
        }
    }
    
    /**
     * Collects properties specific to ReactScrollView.
     *
     * @param view The view to extract properties from
     * @param properties The JSON object to store properties in
     * @throws JSONException If there's an error creating the JSON structure
     */
    private static void collectReactScrollViewProperties(View view, JSONObject properties) throws JSONException {
        // Content offset
        properties.put("scrollX", view.getScrollX());
        properties.put("scrollY", view.getScrollY());
        
        // Scroll enabled
        properties.put("scrollEnabled", view.isEnabled());
        
        // Scroll indicators
        properties.put("showsVerticalScrollIndicator", view.isVerticalScrollBarEnabled());
        properties.put("showsHorizontalScrollIndicator", view.isHorizontalScrollBarEnabled());
    }
    
    /**
     * Collects properties specific to ReactSwitch.
     *
     * @param view The view to extract properties from
     * @param properties The JSON object to store properties in
     * @throws JSONException If there's an error creating the JSON structure
     */
    private static void collectReactSwitchProperties(View view, JSONObject properties) throws JSONException {
        try {
            // Attempt to use reflection to get Switch-specific properties
            java.lang.reflect.Method isCheckedMethod = view.getClass().getMethod("isChecked");
            boolean isChecked = (boolean) isCheckedMethod.invoke(view);
            properties.put("value", isChecked);
            
            // Enabled state
            properties.put("disabled", !view.isEnabled());
            
            // API 21+ properties for thumb and track color
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
                try {
                    java.lang.reflect.Method getThumbTintListMethod = view.getClass().getMethod("getThumbTintList");
                    android.content.res.ColorStateList thumbTintList = 
                        (android.content.res.ColorStateList) getThumbTintListMethod.invoke(view);
                    if (thumbTintList != null) {
                        properties.put("thumbColor", String.format("#%08X", thumbTintList.getDefaultColor()));
                    }
                    
                    java.lang.reflect.Method getTrackTintListMethod = view.getClass().getMethod("getTrackTintList");
                    android.content.res.ColorStateList trackTintList = 
                        (android.content.res.ColorStateList) getTrackTintListMethod.invoke(view);
                    if (trackTintList != null) {
                        properties.put("trackColor", String.format("#%08X", trackTintList.getDefaultColor()));
                    }
                } catch (Exception e) {
                    // Methods not available, skip
                }
            }
        } catch (Exception e) {
            // Methods not available, skip
        }
    }

    /**
     * Validates that a JSON object is properly formatted.
     * Useful for debugging JSON serialization issues.
     *
     * @param jsonObject The object to validate
     * @param path The current path in the object for error reporting
     * @return true if the object is valid, false otherwise
     */
    private static boolean validateJsonObject(JSONObject jsonObject, String path) {
        try {
            // Check all properties in this object
            Iterator<String> keys = jsonObject.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                Object value = jsonObject.get(key);
                String currentPath = path + "." + key;
                
                if (value instanceof JSONObject) {
                    if (!validateJsonObject((JSONObject) value, currentPath)) {
                        return false;
                    }
                } else if (value instanceof JSONArray) {
                    JSONArray array = (JSONArray) value;
                    for (int i = 0; i < array.length(); i++) {
                        Object item = array.get(i);
                        String arrayPath = currentPath + "[" + i + "]";
                        
                        if (item instanceof JSONObject) {
                            if (!validateJsonObject((JSONObject) item, arrayPath)) {
                                return false;
                            }
                        } else if (item instanceof JSONArray) {
                            Log.w(TAG, "Nested array found at " + arrayPath);
                        }
                    }
                }
            }
            return true;
        } catch (Exception e) {
            Log.e(TAG, "JSON validation error at " + path + ": " + e.getMessage());
            return false;
        }
    }
}
