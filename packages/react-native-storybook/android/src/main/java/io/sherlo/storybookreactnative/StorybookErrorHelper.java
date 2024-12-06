package io.sherlo.storybookreactnative;

import android.app.Activity;
import android.view.View;
import android.util.Log;

public class StorybookErrorHelper {
    private static final String TAG = "StorybookErrorHelper";

    public static boolean checkIfContainsStorybookError(Activity activity) {
        View rootView = activity.getWindow().getDecorView().getRootView();
        return searchForStorybookError(rootView);
    }

    private static boolean searchForStorybookError(View view) {
        if (view instanceof android.widget.TextView) {
            String text = ((android.widget.TextView) view).getText().toString();
            if (text.contains("Something went wrong rendering your story")) {
                return true;
            }
        }

        if (view instanceof android.view.ViewGroup) {
            android.view.ViewGroup viewGroup = (android.view.ViewGroup) view;
            for (int i = 0; i < viewGroup.getChildCount(); i++) {
                if (searchForStorybookError(viewGroup.getChildAt(i))) {
                    return true;
                }
            }
        }

        return false;
    }
}
