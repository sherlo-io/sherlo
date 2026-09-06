package io.sherlo.storybookreactnative;

import android.content.Context;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.WritableMap;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * The shim's own state: the pre-main config read and the developer-path mode
 * switch. Everything that used to run after JS existed (screenshots, settle,
 * scroll, inspector data) has moved to the injected implementation - see
 * SherloModule's JNI dispatch table.
 */
public class SherloModuleCore {
    private static final String TAG = "SherloModule:Core";

    // Mode constants
    public static final String MODE_DEFAULT = "default";
    public static final String MODE_STORYBOOK = "storybook";
    public static final String MODE_TESTING = "testing";

    // Module state - all decided pre-main and never re-derived.
    private static JSONObject config = null;
    private static JSONObject lastState = null;
    private static volatile String currentMode = MODE_DEFAULT;
    private static String nativeVersion = null;

    // Guards the pre-main read to a single occurrence per process. Set once by
    // performEarlyInit() - either from SherloInitProvider.onCreate() (normal
    // path, before JS evaluates) or from this class's constructor (fallback).
    private static volatile boolean earlyInitDone = false;

    private final RestartHelper restartHelper;

    /**
     * Reads config and determines mode before any JS exists. Invoked from
     * SherloInitProvider.onCreate() so this runs before Application.onCreate(),
     * matching iOS's dyld constructor. Idempotent - a second call from the
     * constructor fallback below is a no-op.
     *
     * All work is wrapped in try/catch - a ContentProvider that throws from
     * onCreate kills app startup for every user of the SDK.
     *
     * @param context Any non-null Android context (application context is sufficient).
     */
    public static synchronized void performEarlyInit(Context context) {
        if (earlyInitDone) return;
        earlyInitDone = true;

        try {
            FileSystemHelper fsHelper = new FileSystemHelper(context);
            nativeVersion = SherloJsonHelper.getNativeVersion(context);
            config = ConfigHelper.loadConfig(fsHelper);
            if (config == null) return;

            currentMode = ConfigHelper.determineModeFromConfig(config);
            if (MODE_TESTING.equals(currentMode)) {
                lastState = LastStateHelper.getLastState(fsHelper);
            }
        } catch (Throwable t) {
            Log.e(TAG, "Failed to perform early init", t);
        }
    }

    /**
     * @param reactContext The React application context
     */
    public SherloModuleCore(ReactApplicationContext reactContext) {
        // Fallback - normal Android startup already runs this via
        // SherloInitProvider before Application.onCreate(). The call is
        // idempotent so the double-invocation costs nothing.
        performEarlyInit(reactContext);

        this.restartHelper = new RestartHelper(reactContext);

        String persistedMode = restartHelper.getPersistedMode();
        if (persistedMode != null) {
            currentMode = persistedMode;
        }
    }

    /**
     * Returns constants derived entirely from the pre-main read. Exactly four
     * keys - mode, config, lastState, nativeVersion - frozen by the design.
     * This is the shim's fallback answer - see SherloModule.getSherloConstants,
     * which prefers a registered implementation's own synchronous answer first.
     */
    public WritableMap getSherloConstants() {
        final WritableMap constants = Arguments.createMap();
        constants.putString("mode", currentMode);
        constants.putString("config", config != null ? config.toString() : null);
        constants.putString("lastState", lastState != null ? lastState.toString() : null);
        constants.putString("nativeVersion", nativeVersion);
        return constants;
    }

    /**
     * THE SHIM'S ONE BUILTIN.
     *
     * `setMode` is reachable only through invokeSync - it is the developer
     * path, openStorybook()/toggleStorybook() called on a machine with nothing
     * injected, so it has to answer synchronously with no implementation in
     * the picture at all. Deliberately mechanical: persist a flag, restart. No
     * policy, because policy frozen at a customer's build can never be
     * corrected. An injected implementation is consulted FIRST and can
     * override it - see SherloModule.invokeSync().
     *
     * Returns null when the name is not a builtin, so the caller falls through.
     */
    public String builtin(String name, String argsJson) {
        if (!"setMode".equals(name)) return null;

        JSONObject args;
        try {
            args = new JSONObject(argsJson);
        } catch (JSONException e) {
            return "{\"ok\":false,\"code\":\"BAD_ARGS\",\"message\":\"setMode args are not JSON\"}";
        }

        String mode = args.optString("mode", "");
        if (mode.isEmpty()) {
            return "{\"ok\":false,\"code\":\"BAD_ARGS\",\"message\":\"setMode needs a mode string\"}";
        }

        // 'toggle' is resolved against the CURRENT mode here rather than
        // computed in JS, because only native holds that value.
        if ("toggle".equals(mode)) {
            mode = MODE_STORYBOOK.equals(currentMode) ? MODE_DEFAULT : MODE_STORYBOOK;
        }
        currentMode = mode;

        if (args.optBoolean("reload", false)) {
            // The restart is what makes the toggle SAFE: a fresh process is a
            // fresh JS world, so no app state, module-scope value or live
            // timer bleeds into Storybook.
            restartHelper.restart(mode);
        }

        return "{\"ok\":true,\"value\":null}";
    }
}
