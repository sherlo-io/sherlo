package io.sherlo.storybookreactnative;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;

import android.content.Context;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.View;
import android.widget.FrameLayout;

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
}
