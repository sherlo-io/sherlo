package io.sherlo.storybookreactnative;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.View;
import android.widget.FrameLayout;

import com.facebook.react.RecordingReactView;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowLooper;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class TouchHelperTest {

    /** A decor view that keeps what it is sent, as copies, since the helper recycles its events. */
    private static final class RecordingDecor extends FrameLayout {
        final List<float[]> touches = new ArrayList<>();
        final List<Integer> actions = new ArrayList<>();
        final List<Integer> sources = new ArrayList<>();

        RecordingDecor(Context context) {
            super(context);
        }

        @Override
        public boolean dispatchTouchEvent(MotionEvent event) {
            actions.add(event.getActionMasked());
            sources.add(event.getSource());
            touches.add(new float[] {event.getX(), event.getY()});
            return true;
        }
    }

    /** A view that keeps the action of every touch it is sent, and handles it as a FrameLayout. */
    private static final class RecordingView extends FrameLayout {
        final List<Integer> actions = new ArrayList<>();

        RecordingView(Context context) {
            super(context);
        }

        @Override
        public boolean dispatchTouchEvent(MotionEvent event) {
            actions.add(event.getActionMasked());
            return super.dispatchTouchEvent(event);
        }
    }

    @Test
    public void a_tap_sends_a_down_and_an_up_at_the_centre_in_window_pixels_to_the_decor_view() {
        Context context = RuntimeEnvironment.getApplication();
        RecordingDecor decor = new RecordingDecor(context);
        decor.layout(0, 0, 1080, 2400);
        View target = new View(context);
        target.setId(42);
        decor.addView(target, new FrameLayout.LayoutParams(200, 100));
        target.layout(100, 300, 300, 400);
        final TouchHelper.Result[] answer = new TouchHelper.Result[1];

        // The target's centre is (100, 175) in points at density 2.
        TouchHelper.tap(decor, 100, 175, 80, 2f, new TouchHelper.Done() {
            @Override
            public void tapped(TouchHelper.Result result) {
                answer[0] = result;
            }
        });
        ShadowLooper.idleMainLooper();
        assertEquals("the up waits for the hold", 1, decor.actions.size());
        ShadowLooper.idleMainLooper(80, TimeUnit.MILLISECONDS);

        assertEquals(2, decor.actions.size());
        assertEquals(MotionEvent.ACTION_DOWN, (int) decor.actions.get(0));
        assertEquals(MotionEvent.ACTION_UP, (int) decor.actions.get(1));
        for (int i = 0; i < 2; i++) {
            assertEquals(InputDevice.SOURCE_TOUCHSCREEN, decor.sources.get(i) & InputDevice.SOURCE_TOUCHSCREEN);
            assertEquals(200f, decor.touches.get(i)[0], 0f);
            assertEquals(350f, decor.touches.get(i)[1], 0f);
        }
        assertNotNull(answer[0]);
        assertEquals(42, answer[0].hitTag);
        assertEquals("android.view.View", answer[0].hitClass);
        assertFalse(answer[0].reachedReact);
    }

    /** Taps (x, y) in pixels at density 1 and answers what the helper says the touch hit. */
    private static TouchHelper.Result tapAt(View decor, double x, double y) {
        final TouchHelper.Result[] answer = new TouchHelper.Result[1];
        TouchHelper.tap(decor, x, y, 0, 1f, new TouchHelper.Done() {
            @Override
            public void tapped(TouchHelper.Result result) {
                answer[0] = result;
            }
        });
        ShadowLooper.idleMainLooper();
        assertNotNull(answer[0]);
        return answer[0];
    }

    /**
     * `decor` as a window with a React-like target (tag 36) and, laid over the whole of it,
     * `overlay` (id 1). The overlay comes first by index when `overlayFirst`, else last.
     */
    private static FrameLayout windowWithOverlay(FrameLayout decor, View overlay, boolean overlayFirst) {
        decor.layout(0, 0, 1080, 1920);
        View target = new View(decor.getContext());
        target.setId(36);
        overlay.setId(1);
        if (overlayFirst) {
            decor.addView(overlay, new FrameLayout.LayoutParams(1080, 1920));
        }
        decor.addView(target, new FrameLayout.LayoutParams(360, 120));
        if (!overlayFirst) {
            decor.addView(overlay, new FrameLayout.LayoutParams(1080, 1920));
        }
        target.layout(360, 1690, 720, 1810);
        overlay.layout(0, 0, 1080, 1920);
        return decor;
    }

    @Test
    public void a_view_that_lets_a_touch_through_is_never_named_as_the_view_hit() {
        Context context = RuntimeEnvironment.getApplication();
        // Like the dev menu's Compose host: as big as the window, it takes a touch only on its button.
        FrameLayout seeThrough = new FrameLayout(context);
        FrameLayout decor = windowWithOverlay(new FrameLayout(context), seeThrough, false);

        TouchHelper.Result result = tapAt(decor, 540, 1750);

        assertEquals(36, result.hitTag);
        assertEquals("android.view.View", result.hitClass);
    }

    @Test
    public void a_view_that_takes_the_touch_above_the_target_is_still_named_as_the_view_hit() {
        Context context = RuntimeEnvironment.getApplication();
        FrameLayout sheet = new FrameLayout(context);
        sheet.setClickable(true);
        FrameLayout decor = windowWithOverlay(new FrameLayout(context), sheet, false);

        TouchHelper.Result result = tapAt(decor, 540, 1750);

        assertEquals(1, result.hitTag);
        assertEquals("android.widget.FrameLayout", result.hitClass);
    }

    @Test
    public void a_view_that_keeps_the_touch_through_a_touch_listener_is_still_named_as_the_view_hit() {
        Context context = RuntimeEnvironment.getApplication();
        FrameLayout listening = new FrameLayout(context);
        listening.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View view, MotionEvent event) {
                return true;
            }
        });
        FrameLayout decor = windowWithOverlay(new FrameLayout(context), listening, false);

        TouchHelper.Result result = tapAt(decor, 540, 1750);

        assertEquals(1, result.hitTag);
    }

    @Test
    public void a_view_that_keeps_the_asking_down_is_sent_a_cancel_straight_after() {
        Context context = RuntimeEnvironment.getApplication();
        RecordingView sheet = new RecordingView(context);
        sheet.setClickable(true);
        // The decor keeps the tap's own down and up, so the sheet sees only what the helper asks.
        FrameLayout decor = windowWithOverlay(new RecordingDecor(context), sheet, false);

        TouchHelper.Result result = tapAt(decor, 540, 1750);

        assertEquals(1, result.hitTag);
        assertEquals(2, sheet.actions.size());
        assertEquals(MotionEvent.ACTION_DOWN, (int) sheet.actions.get(0));
        assertEquals(MotionEvent.ACTION_CANCEL, (int) sheet.actions.get(1));
    }

    @Test
    public void a_view_holding_react_is_never_sent_an_asking_touch() {
        Context context = RuntimeEnvironment.getApplication();
        RecordingReactView react = new RecordingReactView(context);
        // The decor keeps the tap's own down and up, so React sees only what the helper asks.
        RecordingDecor decor = new RecordingDecor(context);
        windowWithOverlay(decor, react, false);

        TouchHelper.Result result = tapAt(decor, 540, 1750);

        assertEquals(0, react.actions.size());
        assertEquals(1, result.hitTag);
        assertTrue(result.reachedReact);
    }

    @Test
    public void a_view_raised_above_the_others_is_found_though_it_comes_first_by_index() {
        Context context = RuntimeEnvironment.getApplication();
        FrameLayout raised = new FrameLayout(context);
        raised.setClickable(true);
        // Like the dev menu's host: added before the app's root, drawn above it by its z.
        raised.setZ(Float.MAX_VALUE);
        FrameLayout decor = windowWithOverlay(new FrameLayout(context), raised, true);
        // The target takes touches too, so only the order decides which of the two is hit.
        decor.findViewById(36).setClickable(true);

        TouchHelper.Result result = tapAt(decor, 540, 1750);

        assertEquals(1, result.hitTag);
        assertEquals("android.widget.FrameLayout", result.hitClass);
    }
}
