package io.sherlo.storybookreactnative;

import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;

/**
 * A scene's tap as a finger makes it: a touch screen's down and up sent to the window's decor view,
 * the way the system delivers a real one, so every recognizer on the way sees it - React Native's
 * own and gesture-handler's alike. Public API only, and nothing here imports React Native, so the
 * JVM tests compile it alone.
 */
final class TouchHelper {

    /** What a tap answers: the same shape as iOS (ios/TouchHelper). */
    static final class Result {
        /** Whether the view the touch hit is React Native's (it sits under a React view). */
        final boolean reachedReact;
        /** The id of the deepest hit view that carries a React tag, -1 for none. */
        final int hitTag;
        /** The class name of the view the touch hit. */
        final String hitClass;

        Result(boolean reachedReact, int hitTag, String hitClass) {
            this.reachedReact = reachedReact;
            this.hitTag = hitTag;
            this.hitClass = hitClass;
        }
    }

    /** Called on the UI thread once the touch ended. */
    interface Done {
        void tapped(Result result);
    }

    private TouchHelper() {}

    /**
     * Touch the window at (x, y), in points, for holdMs, then lift. The point is sent in window
     * pixels (points times density), where the inspector measures frames. Any thread may call it.
     */
    static void tap(final View decor, final double x, final double y, final double holdMs,
            final float density, final Done done) {
        final Handler ui = new Handler(Looper.getMainLooper());
        ui.post(new Runnable() {
            @Override
            public void run() {
                final float px = (float) (x * density);
                final float py = (float) (y * density);
                final Result result = hitAt(decor, px, py);
                final long downTime = SystemClock.uptimeMillis();
                MotionEvent down = MotionEvent.obtain(downTime, downTime, MotionEvent.ACTION_DOWN, px, py, 0);
                down.setSource(InputDevice.SOURCE_TOUCHSCREEN);
                decor.dispatchTouchEvent(down);
                down.recycle();
                ui.postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        MotionEvent up = MotionEvent.obtain(downTime, SystemClock.uptimeMillis(), MotionEvent.ACTION_UP, px, py, 0);
                        up.setSource(InputDevice.SOURCE_TOUCHSCREEN);
                        decor.dispatchTouchEvent(up);
                        up.recycle();
                        done.tapped(result);
                    }
                }, (long) holdMs);
            }
        });
    }

    /** The deepest visible view holding the point, topmost child first, and what it says of React. */
    private static Result hitAt(View root, float x, float y) {
        View hit = root;
        float localX = x;
        float localY = y;
        boolean descended = true;
        for (; descended && hit instanceof ViewGroup; ) {
            descended = false;
            ViewGroup group = (ViewGroup) hit;
            for (int i = group.getChildCount() - 1; i >= 0; i--) {
                View child = group.getChildAt(i);
                float childX = localX + group.getScrollX() - child.getLeft();
                float childY = localY + group.getScrollY() - child.getTop();
                if (child.getVisibility() == View.VISIBLE && childX >= 0 && childY >= 0
                        && childX < child.getWidth() && childY < child.getHeight()) {
                    hit = child;
                    localX = childX;
                    localY = childY;
                    descended = true;
                    break;
                }
            }
        }
        int hitTag = -1;
        boolean reachedReact = false;
        for (Object view = hit; view instanceof View; view = ((View) view).getParent()) {
            View current = (View) view;
            // React tags are small counters; the app's own ids from resources start with 0x7F.
            if (hitTag < 0 && current.getId() > 0 && (current.getId() >>> 24) != 0x7F) {
                hitTag = current.getId();
            }
            if (current.getClass().getName().startsWith("com.facebook.react.")) {
                reachedReact = true;
            }
        }
        return new Result(reachedReact, hitTag, hit.getClass().getName());
    }
}
