package io.sherlo.storybookreactnative;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import android.content.Context;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class RestartHelperTest {

    private static final String ADDRESS_HANDED_AT_LAUNCH = "ws://127.0.0.1:52001/sherlo/line";

    @Test
    public void the_address_handed_at_launch_is_stored_beside_the_mode_and_read_back_after_the_sdks_own_restart() {
        Context context = RuntimeEnvironment.getApplication();

        // The process before the restart keeps the switch; the one after it reads it back.
        new RestartHelper(context).keepForRestart("storybook", ADDRESS_HANDED_AT_LAUNCH);
        RestartHelper.KeptSwitch keptSwitch = new RestartHelper(context).takeKeptSwitch();

        assertEquals("storybook", keptSwitch.mode);
        assertEquals(ADDRESS_HANDED_AT_LAUNCH, keptSwitch.address);
        // A switch lasts only for the restart it causes.
        assertNull(new RestartHelper(context).takeKeptSwitch());
    }
}
