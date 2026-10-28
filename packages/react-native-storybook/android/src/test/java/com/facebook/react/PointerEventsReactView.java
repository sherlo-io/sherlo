package com.facebook.react;

import android.content.Context;
import android.widget.FrameLayout;

import com.facebook.react.uimanager.PointerEvents;
import com.facebook.react.uimanager.ReactPointerEventsView;

/**
 * A stand-in for one of React Native's views in TouchHelperTest: its package makes it read as
 * React's, and it says the pointer events it is given.
 */
public final class PointerEventsReactView extends FrameLayout implements ReactPointerEventsView {
    private final PointerEvents pointerEvents;

    public PointerEventsReactView(Context context, PointerEvents pointerEvents) {
        super(context);
        this.pointerEvents = pointerEvents;
    }

    @Override
    public PointerEvents getPointerEvents() {
        return pointerEvents;
    }
}
