package io.sherlo.storybookreactnative;

import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

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

    /**
     * The deepest visible view holding the point that would receive the touch, and what it says of
     * React. Where several children hold the point, the topmost that takes the touch wins, and one
     * that lets it through (a see-through overlay, such as the dev menu's Compose host, which takes a
     * touch only on its button) is passed over, as Android's own dispatch passes over it. When none
     * takes it, the touch falls through them all, so the lowest is named.
     */
    private static Result hitAt(View root, float x, float y) {
        View hit = root;
        float localX = x;
        float localY = y;
        boolean descended = true;
        for (; descended && hit instanceof ViewGroup; ) {
            descended = false;
            ViewGroup group = (ViewGroup) hit;
            // The children holding the point, topmost first, each with the point in its own pixels.
            List<View> holding = new ArrayList<>();
            List<float[]> points = new ArrayList<>();
            for (View child : inTouchOrder(group)) {
                float[] point = pointInChild(group, child, localX, localY);
                if (point != null) {
                    holding.add(child);
                    points.add(point);
                }
            }
            // The lowest is never asked: whether or not it keeps the touch, the touch ends there.
            int chosen = holding.size() - 1;
            for (int i = 0; i < holding.size() - 1; i++) {
                if (takesTouch(holding.get(i), points.get(i)[0], points.get(i)[1])) {
                    chosen = i;
                    break;
                }
            }
            if (chosen >= 0) {
                hit = holding.get(chosen);
                localX = points.get(chosen)[0];
                localY = points.get(chosen)[1];
                descended = true;
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
            if (isReactView(current)) {
                reachedReact = true;
            }
        }
        return new Result(reachedReact, hitTag, hit.getClass().getName());
    }

    /**
     * The children of `group` in the order Android hands them a touch: highest z first, and among
     * equal z the one drawn last first, as ViewGroup's own touch dispatch orders them. A custom
     * drawing order is the group's protected secret and is not read.
     */
    private static List<View> inTouchOrder(ViewGroup group) {
        List<View> children = new ArrayList<>();
        for (int i = group.getChildCount() - 1; i >= 0; i--) {
            children.add(group.getChildAt(i));
        }
        // A stable sort: children of equal z keep their drawn-last-first order.
        Collections.sort(children, new Comparator<View>() {
            @Override
            public int compare(View a, View b) {
                return Float.compare(b.getZ(), a.getZ());
            }
        });
        return children;
    }

    /** Whether `view` is one of React Native's own views. */
    private static boolean isReactView(View view) {
        return view.getClass().getName().startsWith("com.facebook.react.");
    }

    /**
     * Whether `view` would keep a touch at (x, y), in its own pixels. A React view that says pointer
     * events none keeps none, and one that says box-none keeps one only where a child does, as React
     * Native's own hit test has it. Any other view that holds React is taken as keeping it, unasked:
     * React's root takes every touch in its bounds, and asking would start a touch in the app. A view
     * that holds none is asked as Android asks it: it is handed a down, and a view that keeps it is
     * handed a cancel at once, so no press is left behind.
     */
    private static boolean takesTouch(View view, float x, float y) {
        String pointerEvents = pointerEventsOf(view);
        if (pointerEvents.equals("NONE")) {
            return false;
        }
        if (pointerEvents.equals("BOX_NONE")) {
            return view instanceof ViewGroup && aChildTakesTouch((ViewGroup) view, x, y);
        }
        if (holdsReact(view)) {
            return true;
        }
        long now = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(now, now, MotionEvent.ACTION_DOWN, x, y, 0);
        down.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        boolean kept = view.dispatchTouchEvent(down);
        down.recycle();
        if (kept) {
            MotionEvent cancel = MotionEvent.obtain(now, now, MotionEvent.ACTION_CANCEL, x, y, 0);
            cancel.setSource(InputDevice.SOURCE_TOUCHSCREEN);
            view.dispatchTouchEvent(cancel);
            cancel.recycle();
        }
        return kept;
    }

    /** Whether any child of the group holding the point (x, y), in the group's pixels, keeps the touch. */
    private static boolean aChildTakesTouch(ViewGroup group, float x, float y) {
        for (View child : inTouchOrder(group)) {
            float[] point = pointInChild(group, child, x, y);
            if (point != null && takesTouch(child, point[0], point[1])) {
                return true;
            }
        }
        return false;
    }

    /**
     * The point (x, y), in the group's pixels, in the pixels of its child; null when the child is
     * not visible or does not hold the point.
     */
    private static float[] pointInChild(ViewGroup group, View child, float x, float y) {
        float childX = x + group.getScrollX() - child.getLeft();
        float childY = y + group.getScrollY() - child.getTop();
        if (child.getVisibility() == View.VISIBLE && childX >= 0 && childY >= 0
                && childX < child.getWidth() && childY < child.getHeight()) {
            return new float[] {childX, childY};
        }
        return null;
    }

    /**
     * What a view says of its pointer events, as React Native names them on Android (its
     * ReactPointerEventsView interface, read by name as nothing here imports React Native): "NONE",
     * "BOX_NONE", "BOX_ONLY" or "AUTO", which is also the answer of a view that says nothing.
     */
    private static String pointerEventsOf(View view) {
        for (Class<?> type = view.getClass(); type != null; type = type.getSuperclass()) {
            for (Class<?> implemented : type.getInterfaces()) {
                if (implemented.getName().equals("com.facebook.react.uimanager.ReactPointerEventsView")) {
                    try {
                        return ((Enum<?>) implemented.getMethod("getPointerEvents").invoke(view)).name();
                    } catch (ReflectiveOperationException | RuntimeException error) {
                        // A view whose pointer events cannot be read is taken as taking touches.
                        return "AUTO";
                    }
                }
            }
        }
        return "AUTO";
    }

    /** Whether `view` is React Native's or holds one of React Native's views. */
    private static boolean holdsReact(View view) {
        if (isReactView(view)) {
            return true;
        }
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                if (holdsReact(group.getChildAt(i))) {
                    return true;
                }
            }
        }
        return false;
    }
}
