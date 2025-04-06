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
            
            // Always try to get size, even if it's 0, to ensure we have font info
            float textSize = textView.getTextSize();
            if (textSize > 0 || true) { // Always add size even if it's 0
                fontObject.put("size", textSize);
            }
            
            // Always add color info
            fontObject.put("color", String.format("#%08X", textView.getCurrentTextColor()));
            
            // Always try to get typeface, with robust fallbacks
            try {
                android.graphics.Typeface typeface = textView.getTypeface();
                // If typeface is null, use the default one
                if (typeface == null) {
                    typeface = android.graphics.Typeface.DEFAULT;
                    fontObject.put("family", "Default");
                } else {
                    // Try to get font name from reflection (may not work on all devices)
                    try {
                        java.lang.reflect.Field field = typeface.getClass().getDeclaredField("mFamilyName");
                        field.setAccessible(true);
                        String familyName = (String) field.get(typeface);
                        if (familyName != null && !familyName.isEmpty()) {
                            fontObject.put("family", familyName);
                        } else {
                            // Fallback to a generic description
                            if (typeface.equals(android.graphics.Typeface.SANS_SERIF)) {
                                fontObject.put("family", "Sans-serif");
                            } else if (typeface.equals(android.graphics.Typeface.SERIF)) {
                                fontObject.put("family", "Serif");
                            } else if (typeface.equals(android.graphics.Typeface.MONOSPACE)) {
                                fontObject.put("family", "Monospace");
                            } else {
                                fontObject.put("family", "Unknown");
                            }
                        }
                    } catch (Exception e) {
                        // If reflection fails, fall back to basic information
                        if (typeface.equals(android.graphics.Typeface.SANS_SERIF)) {
                            fontObject.put("family", "Sans-serif");
                        } else if (typeface.equals(android.graphics.Typeface.SERIF)) {
                            fontObject.put("family", "Serif");
                        } else if (typeface.equals(android.graphics.Typeface.MONOSPACE)) {
                            fontObject.put("family", "Monospace");
                        } else {
                            fontObject.put("family", "Unknown");
                        }
                    }
                    
                    // Convert style numeric value to string representation
                    int typefaceStyle = typeface.getStyle();
                    String styleString;
                    switch (typefaceStyle) {
                        case android.graphics.Typeface.NORMAL:
                            styleString = "Normal";
                            break;
                        case android.graphics.Typeface.BOLD:
                            styleString = "Bold";
                            break;
                        case android.graphics.Typeface.ITALIC:
                            styleString = "Italic";
                            break;
                        case android.graphics.Typeface.BOLD_ITALIC:
                            styleString = "Bold Italic";
                            break;
                        default:
                            styleString = "Unknown (" + typefaceStyle + ")";
                            break;
                    }
                    fontObject.put("style", styleString);
                }
            } catch (Exception e) {
                fontObject.put("style", "Normal");
                fontObject.put("family", "Unknown (exception)");
                Log.w(TAG, "Error getting typeface info: " + e.getMessage());
            }

            // Convert alignment numeric value to string representation
            // Will always provide a value
            try {
                int textAlignment = textView.getTextAlignment();
                String alignmentString;
                switch (textAlignment) {
                    case View.TEXT_ALIGNMENT_INHERIT:
                        alignmentString = "Inherit";
                        break;
                    case View.TEXT_ALIGNMENT_GRAVITY:
                        alignmentString = "Gravity";
                        break;
                    case View.TEXT_ALIGNMENT_TEXT_START:
                        alignmentString = "Text Start";
                        break;
                    case View.TEXT_ALIGNMENT_TEXT_END:
                        alignmentString = "Text End";
                        break;
                    case View.TEXT_ALIGNMENT_CENTER:
                        alignmentString = "Center";
                        break;
                    case View.TEXT_ALIGNMENT_VIEW_START:
                        alignmentString = "View Start";
                        break;
                    case View.TEXT_ALIGNMENT_VIEW_END:
                        alignmentString = "View End";
                        break;
                    default:
                        alignmentString = "Unknown (" + textAlignment + ")";
                        break;
                }
                fontObject.put("alignment", alignmentString);
            } catch (Exception e) {
                fontObject.put("alignment", "Unknown (exception)");
                Log.w(TAG, "Error getting text alignment: " + e.getMessage());
            }
            
            // Add line spacing information with validation
            try {
                float lineSpacingExtra = textView.getLineSpacingExtra();
                float lineSpacingMultiplier = textView.getLineSpacingMultiplier();
                
                if (lineSpacingExtra != 0 || true) { // Always add, even if 0
                    fontObject.put("lineSpacingExtra", lineSpacingExtra);
                }
                
                if (lineSpacingMultiplier != 1 || true) { // Always add, even if 1
                    fontObject.put("lineSpacingMultiplier", lineSpacingMultiplier);
                }
            } catch (Exception e) {
                Log.w(TAG, "Error getting line spacing: " + e.getMessage());
            }
            
            // Add letter spacing if available (API 21+)
            try {
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
                    fontObject.put("letterSpacing", textView.getLetterSpacing());
                }
            } catch (Exception e) {
                Log.w(TAG, "Error getting letter spacing: " + e.getMessage());
            }
            
            // Add max lines information
            try {
                int maxLines = textView.getMaxLines();
                fontObject.put("maxLines", maxLines);
            } catch (Exception e) {
                fontObject.put("maxLines", -1); // -1 indicates unknown/unlimited
                Log.w(TAG, "Error getting max lines: " + e.getMessage());
            }
            
            // Add text truncation/ellipsize mode
            try {
                android.text.TextUtils.TruncateAt ellipsize = textView.getEllipsize();
                if (ellipsize != null) {
                    String ellipsizeMode;
                    if (ellipsize == android.text.TextUtils.TruncateAt.START) {
                        ellipsizeMode = "Start";
                    } else if (ellipsize == android.text.TextUtils.TruncateAt.MIDDLE) {
                        ellipsizeMode = "Middle";
                    } else if (ellipsize == android.text.TextUtils.TruncateAt.END) {
                        ellipsizeMode = "End";
                    } else if (ellipsize == android.text.TextUtils.TruncateAt.MARQUEE) {
                        ellipsizeMode = "Marquee";
                    } else {
                        ellipsizeMode = "Unknown";
                    }
                    fontObject.put("ellipsize", ellipsizeMode);
                } else {
                    fontObject.put("ellipsize", "None");
                }
            } catch (Exception e) {
                Log.w(TAG, "Error getting ellipsize mode: " + e.getMessage());
            }
            
            // Add text decoration information
            try {
                int paintFlags = textView.getPaint().getFlags();
                boolean isUnderlined = (paintFlags & android.graphics.Paint.UNDERLINE_TEXT_FLAG) != 0;
                boolean isStrikeThrough = (paintFlags & android.graphics.Paint.STRIKE_THRU_TEXT_FLAG) != 0;
                
                fontObject.put("underline", isUnderlined);
                fontObject.put("strikethrough", isStrikeThrough);
            } catch (Exception e) {
                Log.w(TAG, "Error getting text decoration: " + e.getMessage());
            }
            
            // Add text direction information
            try {
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.JELLY_BEAN_MR1) {
                    int textDir = textView.getTextDirection();
                    String textDirection;
                    switch (textDir) {
                        case View.TEXT_DIRECTION_INHERIT:
                            textDirection = "Inherit";
                            break;
                        case View.TEXT_DIRECTION_FIRST_STRONG:
                            textDirection = "First Strong";
                            break;
                        case View.TEXT_DIRECTION_ANY_RTL:
                            textDirection = "Any RTL";
                            break;
                        case View.TEXT_DIRECTION_LTR:
                            textDirection = "LTR";
                            break;
                        case View.TEXT_DIRECTION_RTL:
                            textDirection = "RTL";
                            break;
                        case View.TEXT_DIRECTION_LOCALE:
                            textDirection = "Locale";
                            break;
                        default:
                            textDirection = "Unknown";
                            break;
                    }
                    fontObject.put("textDirection", textDirection);
                }
            } catch (Exception e) {
                Log.w(TAG, "Error getting text direction: " + e.getMessage());
            }

            // Always add the font object, even if some properties couldn't be retrieved
            viewObject.put("font", fontObject);
        }
        // Try to handle React Native Text components that might not directly extend TextView
        else if (className.contains("Text") && !className.equals("TextureView")) {
            // This might be a React Native Text component
            try {
                // Try to use reflection to get text value
                String text = null;
                try {
                    java.lang.reflect.Method getText = view.getClass().getMethod("getText");
                    if (getText != null) {
                        Object result = getText.invoke(view);
                        if (result != null) {
                            text = result.toString();
                        }
                    }
                } catch (Exception e) {
                    // Try to get via accessibility label instead
                    CharSequence contentDesc = view.getContentDescription();
                    if (contentDesc != null) {
                        text = contentDesc.toString();
                    }
                }
                
                if (text != null && !text.isEmpty()) {
                    viewObject.put("text", text);
                    
                    // Try to create a basic font object with what we can determine
                    JSONObject fontObject = new JSONObject();
                    
                    // Try to get text color from background/tint
                    int textColor = 0xFF000000; // Default black
                    if (view.getBackground() instanceof ColorDrawable) {
                        textColor = getContrastColor(((ColorDrawable) view.getBackground()).getColor());
                    }
                    fontObject.put("color", String.format("#%08X", textColor));
                    
                    fontObject.put("size", 14.0f); // Default size if we can't determine
                    fontObject.put("family", "Unknown (React Native)");
                    fontObject.put("style", "Normal");
                    
                    viewObject.put("font", fontObject);
                }
            } catch (Exception e) {
                Log.w(TAG, "Error processing React Native text component: " + e.getMessage());
            }
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
        String className = view.getClass().getName();
        boolean isReactNativeView = className.startsWith("com.facebook.react");
        
        if (isReactNativeView) {
            // Enhanced React Native background color detection
            
            // 1. Try to get the background color from the view's background
            if (view.getBackground() instanceof ColorDrawable) {
                color = ((ColorDrawable) view.getBackground()).getColor();
                Log.d(TAG, "Found color from background drawable: " + String.format("#%08X", color));
            }
            
            // 2. For ReactViewGroup specifically, try additional approaches
            if (color == 0 && (className.contains("ReactViewGroup") || className.contains("RCTView"))) {
                try {
                    // Try to access ALL fields via reflection to find color properties
                    java.lang.reflect.Field[] fields = view.getClass().getDeclaredFields();
                    for (java.lang.reflect.Field field : fields) {
                        field.setAccessible(true);
                        String fieldName = field.getName();
                        
                        // Log all field names for debugging
                        Log.d(TAG, "ReactViewGroup field: " + fieldName);
                        
                        // Look for fields that might contain background color
                        if (fieldName.toLowerCase().contains("background") || 
                            fieldName.toLowerCase().contains("color") ||
                            fieldName.toLowerCase().contains("bg") ||
                            fieldName.toLowerCase().contains("border") ||
                            fieldName.toLowerCase().contains("tint") ||
                            fieldName.toLowerCase().contains("style")) {
                            try {
                                Object value = field.get(view);
                                if (value instanceof Integer) {
                                    color = (Integer) value;
                                    if (color != 0) {
                                        Log.d(TAG, "Found background color via reflection: " + 
                                              String.format("#%08X", color) + " in field " + fieldName);
                                        break;
                                    }
                                }
                            } catch (Exception e) {
                                // Ignore access exceptions
                            }
                        }
                    }
                } catch (Exception e) {
                    Log.w(TAG, "Error accessing ReactViewGroup fields: " + e.getMessage());
                }
                
                // Try to get background color via getProperties method if available
                if (color == 0) {
                    try {
                        java.lang.reflect.Method getPropertiesMethod = view.getClass().getMethod("getProperties");
                        if (getPropertiesMethod != null) {
                            Object properties = getPropertiesMethod.invoke(view);
                            if (properties instanceof android.os.Bundle) {
                                android.os.Bundle bundle = (android.os.Bundle) properties;
                                color = bundle.getInt("backgroundColor", 0);
                                if (color != 0) {
                                    Log.d(TAG, "Found background color via getProperties: " + 
                                          String.format("#%08X", color));
                                }
                            }
                        }
                    } catch (Exception e) {
                        // Ignore if method not found
                    }
                }
                
                // Try another approach - check for style attributes
                if (color == 0) {
                    int[] styleAttrs = {
                        android.R.attr.background,
                        android.R.attr.backgroundTint,
                        android.R.attr.backgroundTintMode
                    };
                    
                    android.content.res.TypedArray ta = view.getContext().obtainStyledAttributes(styleAttrs);
                    try {
                        color = ta.getColor(0, 0); // background
                        if (color == 0) {
                            color = ta.getColor(1, 0); // backgroundTint
                        }
                    } catch (Exception e) {
                        // Ignore if attributes not found
                    } finally {
                        ta.recycle();
                    }
                    
                    if (color != 0) {
                        Log.d(TAG, "Found background color via style attributes: " + 
                              String.format("#%08X", color));
                    }
                }
            }
            
            // 3. Check for various React Native tag IDs that might store the color
            if (color == 0) {
                // Standard React Native view tag for background color
                try {
                    int nativeIdTag = com.facebook.react.R.id.view_tag_native_id;
                    Object backgroundColor = view.getTag(nativeIdTag);
                    if (backgroundColor instanceof Integer) {
                        color = (Integer) backgroundColor;
                        Log.d(TAG, "Found color from R.id.view_tag_native_id: " + String.format("#%08X", color));
                    }
                } catch (Exception e) {
                    // Ignore if resource not found
                }
                
                // Try standard Android background ID (safer)
                try {
                    Object tag = view.getTag(android.R.id.background);
                    if (tag instanceof Integer) {
                        color = (Integer) tag;
                        Log.d(TAG, "Found color from android.R.id.background: " + String.format("#%08X", color));
                    }
                } catch (Exception e) {
                    // Ignore if resource not found
                }
                
                // Check ALL tag values using resource IDs from 1 to 100
                // This is a brute force approach but can catch tags we don't know about
                for (int i = 1; i <= 100; i++) {
                    try {
                        Object tag = view.getTag(i);
                        if (tag instanceof Integer) {
                            int tagColor = (Integer) tag;
                            // Only consider it a valid color if it has an alpha component
                            if (tagColor != 0 && (tagColor & 0xFF000000) != 0) {
                                Log.d(TAG, "Found potential color in tag " + i + ": " + String.format("#%08X", tagColor));
                                if (color == 0) color = tagColor; // Only use if we haven't found a color yet
                            }
                        }
                    } catch (Exception e) {
                        // Ignore errors
                    }
                }
            }
            
            // 4. Try to find a ReactBackgroundDrawable if present (used by newer RN versions)
            if (color == 0 && view.getBackground() != null) {
                String bgClassName = view.getBackground().getClass().getName();
                if (bgClassName.contains("ReactBackground")) {
                    try {
                        // Access the color field in ReactBackgroundDrawable
                        java.lang.reflect.Field colorField = view.getBackground().getClass()
                            .getDeclaredField("mColor");
                        colorField.setAccessible(true);
                        Object colorValue = colorField.get(view.getBackground());
                        if (colorValue instanceof Integer) {
                            color = (Integer) colorValue;
                            Log.d(TAG, "Found color from ReactBackgroundDrawable.mColor: " + 
                                  String.format("#%08X", color));
                        }
                    } catch (Exception e) {
                        Log.w(TAG, "Error accessing ReactBackgroundDrawable color: " + e.getMessage());
                    }
                    
                    // Try getting ALL fields from the background drawable
                    try {
                        java.lang.reflect.Field[] fields = view.getBackground().getClass().getDeclaredFields();
                        for (java.lang.reflect.Field field : fields) {
                            field.setAccessible(true);
                            String fieldName = field.getName();
                            
                            // Log field name for debugging
                            Log.d(TAG, "ReactBackground field: " + fieldName);
                            
                            if (fieldName.toLowerCase().contains("color") || 
                                fieldName.toLowerCase().contains("background")) {
                                try {
                                    Object value = field.get(view.getBackground());
                                    if (value instanceof Integer) {
                                        int fieldColor = (Integer) value;
                                        if (fieldColor != 0) {
                                            Log.d(TAG, "Found color in background field " + fieldName + ": " + 
                                                  String.format("#%08X", fieldColor));
                                            if (color == 0) color = fieldColor;
                                        }
                                    }
                                } catch (Exception e) {
                                    // Ignore access exceptions
                                }
                            }
                        }
                    } catch (Exception e) {
                        // Ignore reflection errors
                    }
                }
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
        
        // If we still couldn't find a color but the view has a parent,
        // check if it has a background color that might be relevant
        if (color == 0 && view.getParent() instanceof View) {
            View parent = (View) view.getParent();
            if (parent.getBackground() instanceof ColorDrawable) {
                // Don't inherit parent color automatically, but log it for debugging
                int parentColor = ((ColorDrawable) parent.getBackground()).getColor();
                if (parentColor != 0) {
                    Log.d(TAG, "Parent view has background color: " + 
                          String.format("#%08X", parentColor) + 
                          " but not applying to child " + className);
                }
            }
        }
        
        // Try to safely discover React Native resource IDs through reflection
        try {
            Class<?> reactIdClass = com.facebook.react.R.id.class;
            java.lang.reflect.Field[] fields = reactIdClass.getDeclaredFields();
            for (java.lang.reflect.Field field : fields) {
                String fieldName = field.getName();
                // Look for fields with names suggesting they're related to background or style
                if (fieldName.contains("background") || 
                    fieldName.contains("color") || 
                    fieldName.contains("style")) {
                    try {
                        field.setAccessible(true);
                        int resourceId = field.getInt(null);
                        Object tag = view.getTag(resourceId);
                        if (tag instanceof Integer) {
                            color = (Integer) tag;
                            if (color != 0) {
                                Log.d(TAG, "Found color via reflection from R.id." + fieldName);
                                break;
                            }
                        }
                    } catch (Exception e) {
                        // Ignore access exceptions
                    }
                }
            }
        } catch (Exception e) {
            // Ignore errors finding or processing the R.id class
        }
        
        return color;
    }

    /**
     * Helper method to find a contrasting color (for text) based on a background color.
     * This is used when we can only determine background color but need to guess the text color.
     * 
     * @param backgroundColor The background color as an ARGB integer
     * @return A contrasting color (black for light backgrounds, white for dark backgrounds)
     */
    private static int getContrastColor(int backgroundColor) {
        // Extract RGB components (ignore alpha)
        int red = (backgroundColor >> 16) & 0xFF;
        int green = (backgroundColor >> 8) & 0xFF;
        int blue = backgroundColor & 0xFF;
        
        // Calculate luminance (perceived brightness)
        // Using formula: 0.299*R + 0.587*G + 0.114*B
        double luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
        
        // Return white for dark backgrounds, black for light backgrounds
        return luminance > 0.5 ? 0xFF000000 : 0xFFFFFFFF; // Black or White with full alpha
    }
}
