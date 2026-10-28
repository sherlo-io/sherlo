package io.sherlo.storybookreactnative;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.pm.ApplicationInfo;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class SherloAnswersGateTest {

    private static final String RUNNER_ADDRESS = "ws://127.0.0.1:39123/sherlo/line";

    /** The app's context, built as a release (not debuggable) or a debug build. */
    private static Context appBuiltAs(boolean debuggable) {
        Context context = RuntimeEnvironment.getApplication();
        ApplicationInfo info = context.getApplicationInfo();
        info.flags = debuggable ? info.flags | ApplicationInfo.FLAG_DEBUGGABLE : info.flags & ~ApplicationInfo.FLAG_DEBUGGABLE;
        return context;
    }

    @Test
    public void aLaunchCarryingTheRunnersAddressInstallsTheAnswers() {
        assertTrue(SherloAnswersGate.runCanFollow(appBuiltAs(false), true, RUNNER_ADDRESS));
    }

    @Test
    public void aReleaseLaunchWithNoAddressAndDefaultModeInstallsNothing() {
        Context release = appBuiltAs(false);
        assertFalse(SherloAnswersGate.runCanFollow(release, true, null));
        assertFalse(SherloAnswersGate.runCanFollow(release, true, ""));
    }

    @Test
    public void anAddressOffThisDevicesLoopbackInstallsNothingInARelease() {
        assertFalse(SherloAnswersGate.runCanFollow(appBuiltAs(false), true, "ws://192.168.1.20:39123/sherlo/line"));
    }

    @Test
    public void aDebugBuildInstallsTheAnswersFromTheStartForAReloadedCapture() {
        assertTrue(SherloAnswersGate.runCanFollow(appBuiltAs(true), true, null));
    }

    @Test
    public void aReleaseOutsideDefaultModeInstallsTheAnswers() {
        assertTrue(SherloAnswersGate.runCanFollow(appBuiltAs(false), false, null));
    }
}
