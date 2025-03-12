package io.sherlo.storybookreactnative;

import android.app.Activity;
import android.view.View;
import android.view.ViewGroup;
import android.util.Log;

public class FocusCleaner {
    private static final String TAG = "FocusCleaner";

    public static boolean clearFocus(Activity activity) {
        if (activity == null) return false;
        View rootView = activity.getWindow().getDecorView().getRootView();
        return findAndClearFocus(rootView);
    }

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
