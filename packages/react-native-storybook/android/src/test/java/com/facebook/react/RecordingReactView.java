package com.facebook.react;

import android.content.Context;
import android.view.MotionEvent;
import android.widget.FrameLayout;

import java.util.ArrayList;
import java.util.List;

/**
 * A stand-in for one of React Native's views in TouchHelperTest: its package makes it read as
 * React's, and it keeps the action of every touch it is sent.
 */
public final class RecordingReactView extends FrameLayout {
    public final List<Integer> actions = new ArrayList<>();

    public RecordingReactView(Context context) {
        super(context);
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent event) {
        actions.add(event.getActionMasked());
        return true;
    }
}
