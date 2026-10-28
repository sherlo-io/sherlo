package io.sherlo.storybookreactnative;

import android.content.Context;
import android.content.pm.ApplicationInfo;

/**
 * Where the answering interceptor goes on React Native's clients (SherloRequestAnswers), so a
 * release app outside a Sherlo run keeps React Native's own clients, as on iOS.
 */
final class SherloAnswersGate {
    private SherloAnswersGate() {}

    /**
     * Whether a Sherlo run can follow: in a debuggable build, where Storybook and a capture open by
     * a reload in the same process; outside default mode; or when the launch carried the runner's
     * address on this device's loopback (the only address a run starts from).
     */
    static boolean runCanFollow(Context context, boolean defaultMode, String addressHandedAtLaunch) {
        boolean debuggable = (context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        return debuggable
                || !defaultMode
                || (addressHandedAtLaunch != null && SherloSocket.isLoopbackAddress(addressHandedAtLaunch));
    }
}
