package io.sherlo.storybookreactnative;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import com.jakewharton.processphoenix.ProcessPhoenix;

/**
 * The SDK's own restart, and the switch that survives it.
 *
 * The restart kills the process and starts a new one from a plain launch intent (ProcessPhoenix),
 * which carries no extra. So the mode to come back up in, and the connection's address handed at
 * launch, are kept beside each other in the app's preferences, and the new process reads both back
 * together, once, within ten seconds.
 */
public class RestartHelper {

    private static final String TAG = "SherloModule:RestartHelper";
    private static final String PREFS_NAME = "SherloPrefs";
    private static final String PREF_MODE = "mode";
    private static final String PREF_ADDRESS = "address";
    private static final String PREF_KEPT_AT = "modeTimestamp";
    private static final long KEPT_SWITCH_LIFETIME_MS = 10000;

    /** What a restart left for the process after it. */
    public static final class KeptSwitch {
        /** The mode to come back up in. */
        public final String mode;
        /** The connection's address handed at launch, or null when there was none. */
        public final String address;

        KeptSwitch(String mode, String address) {
            this.mode = mode;
            this.address = address;
        }
    }

    private final Context context;

    public RestartHelper(Context context) {
        this.context = context;
    }

    /**
     * Restarts the app's process into `mode`, keeping `address` for the process that comes back.
     * With no activity to restart from, the switch is kept and nothing restarts.
     */
    public void restart(Activity activity, String mode, String address) {
        keepForRestart(mode, address);
        if (activity != null) {
            ProcessPhoenix.triggerRebirth(activity);
        }
    }

    /** Keeps the mode and the address for the next process, with the time they were kept. */
    public void keepForRestart(String mode, String address) {
        SharedPreferences.Editor editor = preferences().edit()
                .putString(PREF_MODE, mode)
                .putLong(PREF_KEPT_AT, System.currentTimeMillis());
        if (address != null) {
            editor.putString(PREF_ADDRESS, address);
        } else {
            editor.remove(PREF_ADDRESS);
        }
        // Written at once: the process is killed right after.
        editor.commit();
        Log.d(TAG, "Kept for the restart: mode " + mode + (address != null ? ", with an address" : ""));
    }

    /**
     * The switch a restart a moment ago left, read once and cleared. Null when none was left, or
     * when it is older than ten seconds and so belongs to no restart of this launch.
     */
    public KeptSwitch takeKeptSwitch() {
        SharedPreferences preferences = preferences();
        String mode = preferences.getString(PREF_MODE, null);
        String address = preferences.getString(PREF_ADDRESS, null);
        long keptAt = preferences.getLong(PREF_KEPT_AT, 0);

        preferences.edit()
                .remove(PREF_MODE)
                .remove(PREF_ADDRESS)
                .remove(PREF_KEPT_AT)
                .commit();

        if (mode == null || keptAt <= 0) {
            return null;
        }
        long age = System.currentTimeMillis() - keptAt;
        if (age > KEPT_SWITCH_LIFETIME_MS) {
            Log.d(TAG, "The kept switch expired (age: " + age + "ms)");
            return null;
        }
        Log.d(TAG, "Read the switch a restart kept (age: " + age + "ms): mode " + mode);
        return new KeptSwitch(mode, address);
    }

    private SharedPreferences preferences() {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }
}
