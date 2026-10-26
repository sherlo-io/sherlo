package io.sherlo.storybookreactnative;

// Android Framework Imports
import android.app.Activity;
import android.content.Context;
import android.os.Debug;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.View;

// React Native Imports
import com.facebook.react.ReactApplication;
import com.facebook.react.ReactHost;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;
// Java Utility and IO Imports
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Core implementation for the Sherlo module containing all business logic.
 * Manages application modes (default, storybook, testing), the app's one connection to whoever
 * drives it, and provides access to helper utilities.
 *
 * Everything this class keeps lives as long as the process, across every reload of the
 * JavaScript: the mode, the address handed at launch, the connection, the run's settings and the
 * story to show next. A React context and its module come and go with each start of the
 * JavaScript, and read it all again.
 */
public class SherloModuleCore {
    private static final String TAG = "SherloModule:Core";

    // Mode constants
    public static final String MODE_DEFAULT = "default";
    public static final String MODE_STORYBOOK = "storybook";
    public static final String MODE_TESTING = "testing";

    // Driver constants - who drives a testing-mode boot's own walk (see the `driver` field on
    // getSherloConstants and TestDriver in SherloModule.ts).
    public static final String DRIVER_RUNNER = "runner";
    public static final String DRIVER_CAPTURE = "capture";

    /** The event each message the connection brings is raised as, its argument the message's JSON. */
    public static final String MESSAGE_EVENT = "SherloMessage";

    /**
     * How long a launch the runner handed an address waits for the runner's settings before its
     * JavaScript starts without them. The runner answers hello at once over loopback; this only
     * keeps a launch whose runner is gone from standing still forever.
     */
    private static final long RUN_SETTINGS_WAIT_MS = 20000;

    /** How long an error sent as the app dies may take to leave, at most. */
    private static final long DYING_ERROR_WAIT_MS = 2000;

    // Process state, guarded by stateLock.
    private static final Object stateLock = new Object();
    private static volatile String currentMode = MODE_DEFAULT;
    private static volatile String driver = null;
    private static String nativeVersion = null;
    /** The SDK's JS version, as the JavaScript's own `hello` says it; null before any JavaScript. */
    private static volatile String jsVersion = null;
    private static Context applicationContext = null;
    /** The address the runner handed at launch, or kept across the SDK's own restart. */
    private static String addressHandedAtLaunch = null;
    /** True once a switch kept across the SDK's own restart decided this launch's mode. */
    private static boolean modeKeptAcrossRestart = false;
    private static SherloSocket socket = null;
    /** The `settings` of the runner's `config`, or a capture's; null until either arrives. */
    private static JSONObject runSettings = null;
    /** The story to show next, as the last-state call hands it to the JavaScript. */
    private static JSONObject lastState = null;
    /** Counted down once the first `config` arrived, in a launch the runner handed an address. */
    private static CountDownLatch runSettingsArrival = null;

    // Guards early init to a single run per process. Set once by performEarlyInit() - either from
    // SherloInitProvider.onCreate() (normal path, before JS evaluates) or from this class's
    // constructor (fallback).
    private static volatile boolean earlyInitDone = false;

    // The React context of the JavaScript running now, stored by each module as it is made (on
    // old-arch during processPackages(), before the bundle runs). SherloInitProvider reads it at
    // PRE_RUN_JS_BUNDLE_START; the connection hands its messages to it.
    private static volatile java.lang.ref.WeakReference<ReactApplicationContext> currentReactContextReference = null;

    // Set to true once the original JS error was sent (SherloJSExceptionCapture or
    // reportEarlyJsError). Keeps the fallback UncaughtExceptionHandler from sending the wrong one.
    private static volatile boolean sJsErrorCaptured = false;

    /**
     * Reads what the process needs before any JavaScript, and decides the mode when the SDK's own
     * restart a moment ago left a switch: the switch wins, and the address kept beside it opens
     * the connection again. Idempotent - subsequent calls are no-ops.
     *
     * Invoked from SherloInitProvider.onCreate(), before Application.onCreate() and any JavaScript.
     * A launch with no switch decides later, when its first activity is made: see
     * startFromAddressHandedAtLaunch.
     *
     * All work is wrapped in try/catch - a ContentProvider that throws from onCreate kills
     * app startup for every user of the SDK.
     *
     * @param context Any non-null Android context (application context is sufficient).
     */
    public static void performEarlyInit(Context context) {
        synchronized (stateLock) {
            if (earlyInitDone) return;
            earlyInitDone = true;
        }

        try {
            Context appContext = context.getApplicationContext() != null ? context.getApplicationContext() : context;
            synchronized (stateLock) {
                applicationContext = appContext;
            }
            nativeVersion = SherloJsonHelper.getNativeVersion(appContext);

            RestartHelper.KeptSwitch keptSwitch = new RestartHelper(appContext).takeKeptSwitch();
            if (keptSwitch == null) return;

            synchronized (stateLock) {
                modeKeptAcrossRestart = true;
            }
            if (MODE_TESTING.equals(keptSwitch.mode) && keptSwitch.address != null) {
                startTestingRun(keptSwitch.address);
                return;
            }
            currentMode = keptSwitch.mode;
            if (keptSwitch.address != null) {
                synchronized (stateLock) {
                    addressHandedAtLaunch = keptSwitch.address;
                }
                openConnectionToTheRunner(keptSwitch.address);
            }
            Log.d(TAG, "Mode kept across the SDK's own restart: " + currentMode);
        } catch (Throwable t) {
            Log.e(TAG, "Failed to perform early init", t);
        }
    }

    /**
     * The address the launching intent carried (`--es sherloAddress <url>`), read as the first
     * activity is made, before its JavaScript starts. A loopback address puts the app in testing
     * mode and opens the connection; anything else, or a switch kept across the SDK's own restart,
     * leaves the mode alone.
     */
    public static void startFromAddressHandedAtLaunch(String address, String sceneId) {
        if (address == null || address.isEmpty()) return;
        synchronized (stateLock) {
            if (modeKeptAcrossRestart) return;
        }
        if (!SherloSocket.isLoopbackAddress(address)) {
            Log.w(TAG, "The address handed at launch is not on this device's loopback; it is ignored");
            return;
        }
        startTestingRun(address);
        // A scene launch hands the scene's id beside the address: that scene is the story the
        // app starts on, and the connection to the runner stays.
        keepStory(sceneId);
    }

    /**
     * A launch whose intent carried `sherloCapture` starts in testing mode for `sherlo capture`, as
     * a capture's own move (openTesting) leaves it, but with no boot of the app before it: the
     * first JavaScript that runs is already in testing mode, on `storyId` when one is given, so the
     * app's own start never runs. A debuggable build only: a capture needs a bundler beside the
     * app, and any app on the device can send an intent with extras to a shipped app.
     */
    public static void startFromCaptureHandedAtLaunch(Context context, String storyId) {
        boolean debuggable =
                (context.getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        if (!debuggable) return;
        synchronized (stateLock) {
            if (modeKeptAcrossRestart) return;
        }
        startCaptureTestingOn(storyId);
        Log.d(TAG, "Testing mode: a capture launch");
    }

    /**
     * Puts the app in testing mode driven by a capture, keeping `storyId` (when one is given) as
     * the story the next start of the JavaScript lands on.
     */
    private static void startCaptureTestingOn(String storyId) {
        keepStory(storyId);
        currentMode = MODE_TESTING;
        driver = DRIVER_CAPTURE;
    }

    /** Whether the launch has the capture discover; kept in the state beside the story. */
    private static volatile boolean discover = false;

    /** Called before the launch keeps its story: the intent's sherloDiscover extra. */
    public static void setDiscover(boolean on) {
        discover = on;
    }

    /** Keeps `storyId` (when one is given) as the story the next start of the JavaScript lands on. */
    private static void keepStory(String storyId) {
        if (storyId == null || storyId.isEmpty()) return;
        try {
            JSONObject nextSnapshot = new JSONObject();
            nextSnapshot.put("storyId", storyId);
            JSONObject storyToShow = new JSONObject();
            storyToShow.put("nextSnapshot", nextSnapshot);
            storyToShow.put("requestId", "");
            storyToShow.put("discover", discover);
            synchronized (stateLock) {
                lastState = storyToShow;
            }
        } catch (JSONException cannotHappen) {
            Log.e(TAG, "Failed to keep the story a capture handed over", cannotHappen);
        }
    }

    /**
     * A run the runner launched: testing mode, the connection opened, and the native load said
     * before any JavaScript runs, so a crash at the top of the bundle still leaves a trace.
     */
    private static void startTestingRun(String address) {
        synchronized (stateLock) {
            if (socket != null) return;
            addressHandedAtLaunch = address;
            runSettingsArrival = new CountDownLatch(1);
        }
        currentMode = MODE_TESTING;
        driver = DRIVER_RUNNER;
        openConnectionToTheRunner(address);
        send(messageWithAction("NATIVE_INIT_STARTED"));
        send(messageWithAction("NATIVE_LOADED"));
        Log.d(TAG, "Testing mode: the runner handed an address at launch");
    }

    /**
     * Initializes the module for one start of the JavaScript. Everything it answers with lives in
     * the process (see the top of this class); the module only remembers its React context.
     *
     * @param reactContext The React application context
     */
    public SherloModuleCore(ReactApplicationContext reactContext) {
        // Store context before initializeWithInstance() runs so PRE_RUN_JS_BUNDLE_START can retrieve it.
        rememberReactContext(reactContext);
        // Each start of the JavaScript reports its own first error.
        sJsErrorCaptured = false;

        // Fallback - normal Android startup already runs this via SherloInitProvider before
        // Application.onCreate(). The call is idempotent so the double-invocation costs nothing.
        performEarlyInit(reactContext);

        Log.d(TAG, "SherloModuleCore initialized with mode: " + currentMode);
    }

    /**
     * Returns the current mode string. Safe to call before constructor - falls back to
     * MODE_DEFAULT.
     */
    public static String getCurrentMode() {
        return currentMode != null ? currentMode : MODE_DEFAULT;
    }

    public static void rememberReactContext(ReactApplicationContext reactContext) {
        currentReactContextReference = new java.lang.ref.WeakReference<>(reactContext);
    }

    /** The React context of the JavaScript running now, or null before any. */
    public static ReactApplicationContext currentReactContext() {
        java.lang.ref.WeakReference<ReactApplicationContext> reference = currentReactContextReference;
        return reference != null ? reference.get() : null;
    }

    public static void markJsErrorCaptured() {
        sJsErrorCaptured = true;
    }

    public static boolean isJsErrorCaptured() {
        return sJsErrorCaptured;
    }

    // ============ The connection ============

    /** What every hello says: native's version, and the JavaScript's once it told it. */
    private static final SherloSocket.HelloVersions HELLO_VERSIONS = new SherloSocket.HelloVersions() {
        @Override
        public String nativeVersion() {
            return nativeVersion;
        }

        @Override
        public String jsVersion() {
            return jsVersion;
        }
    };

    private static final SherloSocket.MessageListener RECEIVE_MESSAGE = new SherloSocket.MessageListener() {
        @Override
        public void onMessage(String messageText) {
            receiveMessage(messageText);
        }
    };

    /** Opens the app's one connection to the runner's address, unless one is open. */
    private static void openConnectionToTheRunner(String address) {
        openConnection(SherloSocket.toTheRunner(address, HELLO_VERSIONS, RECEIVE_MESSAGE));
    }

    /** Starts the given connection as the app's one, unless one is open; every message it brings goes to receiveMessage. */
    private static void openConnection(SherloSocket newSocket) {
        synchronized (stateLock) {
            if (socket != null) return;
            socket = newSocket;
        }
        newSocket.start();
    }

    private static SherloSocket currentSocket() {
        synchronized (stateLock) {
            return socket;
        }
    }

    /** Sends one message, when there is a connection to send it on. */
    private static void send(JSONObject message) {
        SherloSocket openSocket = currentSocket();
        if (openSocket != null) openSocket.send(message.toString());
    }

    private static JSONObject messageWithAction(String action) {
        JSONObject message = new JSONObject();
        try {
            message.put("action", action);
        } catch (JSONException cannotHappen) {
            throw new IllegalStateException(cannotHappen);
        }
        return message;
    }

    /**
     * One message the connection brought, on the connection's reading thread. Native code acts on
     * two itself: `config` before the JavaScript starts, and `story` by reloading the JavaScript.
     * Every message is then handed to the JavaScript running now, if any.
     */
    private static void receiveMessage(String messageText) {
        JSONObject message;
        try {
            message = new JSONObject(messageText);
        } catch (JSONException notJson) {
            Log.w(TAG, "The connection brought a message that is not a JSON object; it is ignored");
            return;
        }

        String action = message.optString("action");
        if ("config".equals(action)) {
            keepRunSettings(message);
        } else if ("story".equals(action)) {
            showStory(message);
        }

        handToJavaScript(messageText);
    }

    /** The runner's `config`: its settings for every start of the JavaScript, and any newer core. */
    private static void keepRunSettings(JSONObject config) {
        JSONObject settings = config.optJSONObject("settings");
        JSONObject jsCore = config.optJSONObject("jsCore");
        if (jsCore != null) {
            SherloCoreLoader.keepSentCore(jsCore.optString("source", null), jsCore.optString("signature", null));
        }

        // A `config` comes after every hello; only the first one, at launch, is waited for.
        CountDownLatch arrival;
        synchronized (stateLock) {
            if (settings != null) runSettings = settings;
            arrival = runSettingsArrival;
            runSettingsArrival = null;
        }
        if (arrival != null) arrival.countDown();
    }

    /** The runner's `story`: kept for the next start of the JavaScript, which shows it. */
    private static void showStory(JSONObject story) {
        try {
            JSONObject parameters = story.optJSONObject("parameters");
            JSONObject nextSnapshot = new JSONObject();
            nextSnapshot.put("storyId", story.optString("storyId"));
            nextSnapshot.put("parameters", parameters != null ? parameters : new JSONObject());
            JSONObject storyToShow = new JSONObject();
            storyToShow.put("nextSnapshot", nextSnapshot);
            storyToShow.put("requestId", story.optString("requestId"));
            synchronized (stateLock) {
                lastState = storyToShow;
            }
        } catch (JSONException cannotHappen) {
            Log.e(TAG, "Failed to keep the story the runner named", cannotHappen);
            return;
        }
        reloadJavaScript("Sherlo: the next story");
    }

    /** Raises the message as a SherloMessage event in the JavaScript running now, if any. */
    private static void handToJavaScript(String messageText) {
        ReactApplicationContext reactContext = currentReactContext();
        if (reactContext == null || !reactContext.hasActiveReactInstance()) return;
        try {
            reactContext.emitDeviceEvent(MESSAGE_EVENT, messageText);
        } catch (Throwable t) {
            Log.w(TAG, "Failed to hand a message to the JavaScript", t);
        }
    }

    /** In a launch the runner handed an address, waits for its first `config`, at most a while. */
    private static void waitForRunSettings() {
        CountDownLatch arrival;
        synchronized (stateLock) {
            arrival = runSettingsArrival;
        }
        if (arrival == null) return;
        try {
            if (!arrival.await(RUN_SETTINGS_WAIT_MS, TimeUnit.MILLISECONDS)) {
                Log.w(TAG, "The runner sent no settings within " + RUN_SETTINGS_WAIT_MS + "ms; the JavaScript starts without them");
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }

    /**
     * Starts the app's JavaScript again in the same process, on the main thread: ReactHost.reload
     * on the new architecture, a new React context on the old one. The process, and with it the
     * connection and everything this class keeps, lives on.
     */
    private static void reloadJavaScript(final String reason) {
        Context appContext;
        synchronized (stateLock) {
            appContext = applicationContext;
        }
        if (!(appContext instanceof ReactApplication)) {
            Log.w(TAG, "Cannot reload the JavaScript: the application is not a ReactApplication");
            return;
        }
        final ReactApplication reactApplication = (ReactApplication) appContext;
        new Handler(Looper.getMainLooper()).post(new Runnable() {
            @Override
            public void run() {
                try {
                    ReactHost reactHost = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED ? reactApplication.getReactHost() : null;
                    if (reactHost != null) {
                        reactHost.reload(reason);
                    } else {
                        reactApplication.getReactNativeHost().getReactInstanceManager().recreateReactContextInBackground();
                    }
                } catch (Throwable t) {
                    Log.e(TAG, "Failed to reload the JavaScript", t);
                }
            }
        });
    }

    /**
     * The JSON loadCore answers with: the core native code picked. In a launch the runner handed an
     * address, the runner's first `config` is waited for first, since it may carry a newer core.
     */
    public static String loadCore(Context context) {
        waitForRunSettings();
        return SherloCoreLoader.loadCoreJson(context);
    }

    /**
     * Sends one message from the JavaScript. The JavaScript's own `hello` is not sent: native code
     * says hello on every connection, and takes from it the JS version to say.
     */
    public void sendMessage(String messageJson) {
        JSONObject message;
        try {
            message = new JSONObject(messageJson);
        } catch (JSONException notJson) {
            Log.w(TAG, "sendMessage: not a JSON object, not sent");
            return;
        }

        String action = message.optString("action");
        if ("hello".equals(action)) {
            jsVersion = message.isNull("jsVersion") ? null : message.optString("jsVersion", null);
            return;
        }

        SherloSocket openSocket = currentSocket();
        if (openSocket == null) return;
        if ("log".equals(action)) {
            openSocket.sendLogLine(messageJson);
        } else {
            openSocket.send(messageJson);
        }
    }

    /**
     * Opens the connection to the Sherlo address of the bundler the bundle was served from, on
     * any host (10.0.2.2 on an emulator, a LAN address for a phone), unless one is open. ws://
     * only. A release build is served by no bundler, so this opens nothing there.
     */
    public void dialBundler(String address) {
        if (address == null || address.isEmpty()) return;
        if (!SherloSocket.isWebSocketAddress(address)) {
            Log.w(TAG, "dialBundler: the bundler's address is not ws://; nothing is dialled");
            return;
        }
        openConnection(SherloSocket.toTheBundler(address, HELLO_VERSIONS, RECEIVE_MESSAGE));
    }

    /** The memory the app's process uses, in MB: its total PSS. -1 when it cannot be measured. */
    public void getMemoryMb(Promise promise) {
        try {
            Debug.MemoryInfo memoryInfo = new Debug.MemoryInfo();
            Debug.getMemoryInfo(memoryInfo);
            double totalPssMb = memoryInfo.getTotalPss() / 1024.0;
            promise.resolve((double) Math.round(totalPssMb));
        } catch (Throwable t) {
            Log.w(TAG, "Failed to measure the process's memory", t);
            promise.resolve(-1.0);
        }
    }

    /** Starts the app's JavaScript again in the same process; the connection stays open. */
    public void reloadJavaScript() {
        reloadJavaScript("Sherlo: the JavaScript asked for a reload");
    }

    // ============ Modes ============

    /**
     * Returns constants exposed to the JavaScript side: the mode, the run's settings as `config`,
     * and the story to show as `lastState`. Read at every start of the JavaScript.
     *
     * @return A map containing the module constants
     */
    public WritableMap getSherloConstants() {
        waitForRunSettings();

        JSONObject settings;
        JSONObject storyToShow;
        synchronized (stateLock) {
            settings = runSettings;
            storyToShow = lastState;
        }

        final WritableMap constants = Arguments.createMap();
        constants.putString("mode", currentMode);
        constants.putString("config", settings != null ? settings.toString() : null);
        constants.putString("lastState", storyToShow != null ? storyToShow.toString() : null);
        constants.putString("nativeVersion", nativeVersion);
        constants.putString("driver", driver);
        // The C core's version, for the START that reports which core ran. Only a run reads it, so
        // only testing mode loads the C core to ask.
        constants.putString("compiledCoreVersion",
                MODE_TESTING.equals(currentMode) ? CompiledCore.version() : null);
        return constants;
    }

    /**
     * Toggles between Storybook and default modes.
     * If currently in Storybook mode, switches to default, otherwise switches to Storybook.
     */
    public void toggleStorybook(Activity activity) {
        String newMode = MODE_STORYBOOK.equals(currentMode) ? MODE_DEFAULT : MODE_STORYBOOK;
        restartInto(activity, newMode);
    }

    /**
     * Switches to Storybook mode by restarting the app.
     */
    public void openStorybook(Activity activity) {
        restartInto(activity, MODE_STORYBOOK);
    }

    /**
     * Switches to default mode by restarting the app.
     */
    public void closeStorybook(Activity activity) {
        restartInto(activity, MODE_DEFAULT);
    }

    /** The SDK's own restart, keeping the address handed at launch for the process after it. */
    private static void restartInto(Activity activity, String mode) {
        Context appContext;
        String address;
        synchronized (stateLock) {
            appContext = applicationContext;
            address = addressHandedAtLaunch;
        }
        if (appContext == null) return;
        new RestartHelper(appContext).restart(activity, mode, address);
    }

    /**
     * Switches to testing mode by reloading the JavaScript: how a capture moves the app, so
     * isRunningVisualTests is true when the JavaScript starts again. The process and its
     * connection stay, so the mode, the settings and the story set here are what the new start
     * reads back through getConfig()/getLastState(), with an empty requestId because a capture has
     * none.
     *
     * @param storyId    the story to land the reloaded app on directly, or empty when there is none.
     * @param configJson the settings to hand over as `config` - the caller's getConfigOrDefault()
     *                   answer, since no runner sends a capture its settings.
     */
    public void openTesting(String storyId, String configJson) {
        JSONObject captureSettings = null;
        if (configJson != null && !configJson.isEmpty()) {
            try {
                captureSettings = new JSONObject(configJson);
            } catch (JSONException e) {
                Log.e(TAG, "Failed to parse the settings a capture handed over", e);
            }
        }

        synchronized (stateLock) {
            if (captureSettings != null) runSettings = captureSettings;
        }
        startCaptureTestingOn(storyId);
        reloadJavaScript("Sherlo: a capture moves the app into testing mode");
    }

    // ============ Errors ============

    /**
     * Sends a NATIVE_ERROR from the JavaScript over the connection, in testing mode only.
     *
     * @param errorCode The error code (e.g. ERROR_SDK_COMPATIBILITY)
     * @param message Human-readable error description
     * @param dataJson The error's data as JSON, or empty when it has none
     */
    public void sendNativeError(String errorCode, String message, String dataJson) {
        JSONObject data = null;
        if (dataJson != null && !dataJson.isEmpty()) {
            try {
                data = new JSONObject(dataJson);
            } catch (JSONException e) {
                Log.w(TAG, "sendNativeError: its data is not a JSON object; sent without it");
            }
        }
        sendNativeErrorMessage(errorCode, message, data);
    }

    /** Sends a NATIVE_ERROR native code found, in testing mode only. */
    public static void sendNativeErrorMessage(String errorCode, String message, JSONObject data) {
        if (!MODE_TESTING.equals(currentMode)) return;
        try {
            JSONObject nativeError = messageWithAction("NATIVE_ERROR");
            nativeError.put("errorCode", errorCode != null ? errorCode : "");
            nativeError.put("message", message != null ? message : "");
            if (data != null) nativeError.put("data", data);
            send(nativeError);
        } catch (JSONException cannotHappen) {
            Log.e(TAG, "Failed to build a NATIVE_ERROR", cannotHappen);
        }
    }

    /**
     * Sends the JavaScript's first error as the app dies, and waits until the socket took it, at
     * most two seconds, so it leaves before the process is let go. Testing mode only. Marks the
     * error captured, so a later, secondary error is not sent in its place.
     *
     * @return true when the error was written to the socket in time.
     */
    public static boolean sendJsErrorAndWait(String name, String message, String stack) {
        if (!MODE_TESTING.equals(currentMode)) return false;
        SherloSocket openSocket = currentSocket();
        if (openSocket == null) return false;
        try {
            JSONObject error = new JSONObject();
            error.put("name", name != null ? name : "Error");
            error.put("message", message != null ? message : "");
            error.put("stack", stack != null ? stack : "");
            error.put("componentStack", new JSONArray());
            error.put("digest", JSONObject.NULL);
            error.put("cause", JSONObject.NULL);
            JSONObject jsError = messageWithAction("JS_ERROR");
            jsError.put("data", error);
            markJsErrorCaptured();
            return openSocket.sendAndWaitUntilWritten(jsError.toString(), DYING_ERROR_WAIT_MS);
        } catch (JSONException cannotHappen) {
            Log.e(TAG, "Failed to build a JS_ERROR", cannotHappen);
            return false;
        }
    }

    /**
     * Sends a JS_ERROR for module-eval errors caught by the metro __r polyfill, and waits until the
     * socket took it. Must never throw. Refused outside testing mode, even if the JS-side gate
     * (metro/polyfill.js) is bypassed.
     */
    public boolean reportEarlyJsError(String name, String message, String stack) {
        try {
            return sendJsErrorAndWait(name, message, stack);
        } catch (Throwable t) {
            Log.e(TAG, "reportEarlyJsError failed", t);
            return false;
        }
    }

    /**
     * Gets UI inspector data from the current view hierarchy.
     * 
     * @param activity The current activity
     * @param promise Promise to resolve with the inspector data or reject with an error
     */
    public void getInspectorData(Activity activity, Promise promise) {
        InspectorHelper.getInspectorData(activity, promise);
    }

    /**
     * Touches the app window at (x, y), in points, for holdMs, as a finger does: a scene's tap.
     * Resolves, once the touch ended, with whether a React view took it, the hit view's tag (-1 for
     * none) and class. Android has no private calls to lack, so `missing` is always empty.
     */
    public void tap(Activity activity, double x, double y, double holdMs, final Promise promise) {
        if (activity == null) {
            promise.reject("no_window", "The app has no window to tap");
            return;
        }
        View decor = activity.getWindow().getDecorView();
        TouchHelper.tap(decor, x, y, holdMs, decor.getResources().getDisplayMetrics().density,
                new TouchHelper.Done() {
                    @Override
                    public void tapped(TouchHelper.Result result) {
                        WritableMap answer = Arguments.createMap();
                        answer.putBoolean("reachedReact", result.reachedReact);
                        answer.putInt("hitTag", result.hitTag);
                        answer.putString("hitClass", result.hitClass);
                        answer.putArray("missing", Arguments.createArray());
                        promise.resolve(answer);
                    }
                });
    }

    /**
     * Whether each view named by testID is drawn, from the native view tree.
     *
     * @param activity The current activity
     * @param testIDsJson A JSON list of testIDs
     * @param promise Promise to resolve with a JSON object of visible, invisible, absent or unreached by testID
     */
    public void getViewVisibility(Activity activity, String testIDsJson, Promise promise) {
        InspectorHelper.getViewVisibility(activity, testIDsJson, promise);
    }

    /**
     * Checks if the UI is stable by comparing consecutive screenshots.
     * 
     * @param activity The current activity
     * @param requiredMatches The number of consecutive matching screenshots needed
     * @param minScreenshotsCount The minimum number of screenshots to take when checking for stability
     * @param intervalMs The interval between each screenshot (in milliseconds)
     * @param timeoutMs The overall timeout (in milliseconds)
     * @param threshold Matching threshold (0.0 to 1.0); smaller values are more sensitive
     * @param includeAA If false, ignore anti-aliased pixels when counting differences
     * @param promise Promise to resolve with the stability result or reject with an error
     */
    public void stabilize(Activity activity, int requiredMatches, int minScreenshotsCount, int intervalMs, int timeoutMs, double threshold, boolean includeAA, Promise promise) {
        StabilityHelper.stabilize(activity, requiredMatches, minScreenshotsCount, intervalMs, timeoutMs, threshold, includeAA, promise);
    }

    /**
     * Native paint barrier: force a redraw and resolve on the next
     * real frame commit, capped at timeoutMs.
     *
     * @param activity  The current activity
     * @param timeoutMs Cap on how long to wait for a frame commit (ms)
     * @param promise   Resolves true if a frame commit was observed, false on timeout
     */
    public void awaitFrameCommit(Activity activity, int timeoutMs, Promise promise) {
        StabilityHelper.awaitFrameCommit(activity, timeoutMs, promise);
    }

    // ============ Scroll Detection ============

    private static final boolean SCROLL_DEBUG = true;

    // Locked scroll view from isScrollable(), reused by scrollToCheckpoint()
    private View lockedScrollView = null;

    /**
     * Detects if the currently visible screen can be vertically scrolled for long-screenshot capture.
     * Resolves with a map: {scrollable: boolean, scrollViewFrame?: {x, y, width, height}} in physical pixels.
     *
     * @param activity The current activity
     * @param promise Promise to resolve with the result map
     */
    public void isScrollable(Activity activity, Promise promise) {
        if (activity == null) {
            if (SCROLL_DEBUG) {
                Log.d(TAG, "isScrollable: No activity");
            }
            WritableMap noResult = Arguments.createMap();
            noResult.putBoolean("scrollable", false);
            promise.resolve(noResult);
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                WritableMap result = detectScrollableView(activity);
                promise.resolve(result);
            } catch (Exception e) {
                if (SCROLL_DEBUG) {
                    Log.e(TAG, "isScrollable exception", e);
                }
                WritableMap noResult = Arguments.createMap();
                noResult.putBoolean("scrollable", false);
                promise.resolve(noResult);
            }
        });
    }

    // ============ Checkpoint Scrolling ============

    /**
     * Deterministically scrolls to a checkpoint index.
     *
     * @param index The checkpoint index (0-based)
     * @param offset The vertical offset per checkpoint (in pixels)
     * @param maxIndex The maximum allowed index
     */
    public void scrollToCheckpoint(Activity activity, double index, double offset, double maxIndex, Promise promise) {
        if (activity == null) {
            promise.resolve(createScrollResult(true, 0, 0, 0, 0, null));
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                WritableMap result = performScrollToCheckpoint(activity, (int)index, (int)offset, (int)maxIndex);
                promise.resolve(result);
            } catch (Exception e) {
                if (SCROLL_DEBUG) {
                    Log.e(TAG, "scrollToCheckpoint exception", e);
                }
                promise.resolve(createScrollResult(true, 0, 0, 0, 0, null));
            }
        });
    }

    private WritableMap performScrollToCheckpoint(Activity activity, int index, int offsetPx, int maxIndex) {
        // 1. Use locked scroll view from isScrollable() - no re-detection
        View candidate = lockedScrollView;

        if (candidate == null || candidate.getWindowToken() == null) {
            if (SCROLL_DEBUG) {
                Log.d(TAG, "scrollToCheckpoint: No locked candidate found");
            }
            return createScrollResult(true, 0, 0, 0, 0, null);
        }

        // Suppress scroll indicators for the duration of testing
        candidate.setVerticalScrollBarEnabled(false);
        candidate.setHorizontalScrollBarEnabled(false);

        // 2. Read Metrics
        int viewportPx = candidate.getHeight();

        int range = getScrollRangeViaReflection(candidate);
        if (range <= 0) {
            if (SCROLL_DEBUG) {
                Log.d(TAG, "scrollToCheckpoint: Could not determine scroll range");
            }
        }

        int extent = getScrollExtentViaReflection(candidate);

        // 3. Plan: the C core keeps the index in range and the target inside the scroll range
        int targetPx = CompiledCore.nativeCheckpointTarget(index, offsetPx, maxIndex, viewportPx, range, extent);

        // 4. Apply Scroll
        int currentOffset = getScrollOffsetViaReflection(candidate);
        int delta = targetPx - currentOffset;

        if (SCROLL_DEBUG) {
            Log.d(TAG, "scrollToCheckpoint: index=" + index + ", target=" + targetPx + ", current=" + currentOffset + ", delta=" + delta);
        }

        if (Math.abs(delta) > 0) {
            scrollViewBy(candidate, delta);
        }

        // 5. Read Back: the offset reached, and whether this is the bottom
        int actualOffsetPx = getScrollOffsetViaReflection(candidate);
        int[] result = new int[5];
        CompiledCore.nativeCheckpointReadBack(index, offsetPx, maxIndex, viewportPx, range, extent, actualOffsetPx, result);

        WritableMap frame = getScrollViewFrameInPixels(candidate);
        return createScrollResult(result[0] == 1, result[1], result[2], result[3], result[4], frame);
    }

    private WritableMap createScrollResult(boolean reachedBottom, int appliedIndex, int appliedOffsetPx, int viewportPx, int contentPx, WritableMap scrollViewFrame) {
        WritableMap map = Arguments.createMap();
        map.putBoolean("reachedBottom", reachedBottom);
        map.putInt("appliedIndex", appliedIndex);
        map.putInt("appliedOffsetPx", appliedOffsetPx);
        map.putInt("viewportPx", viewportPx);
        map.putInt("contentPx", contentPx);
        if (scrollViewFrame != null) {
            map.putMap("scrollViewFrame", scrollViewFrame);
        }
        return map;
    }

    /**
     * Get vertical scroll extent using reflection since the method is protected.
     */
    private int getScrollExtentViaReflection(View view) {
        try {
            java.lang.reflect.Method method = View.class.getDeclaredMethod("computeVerticalScrollExtent");
            method.setAccessible(true);
            return (Integer) method.invoke(view);
        } catch (Exception e) {
            if (SCROLL_DEBUG) {
                Log.d(TAG, "Failed to get scroll extent via reflection: " + e.getMessage());
            }
            return -1;
        }
    }

    /**
     * Main detection logic for scrollable views. Returns map with scrollable + optional scrollViewFrame.
     */
    private WritableMap detectScrollableView(Activity activity) {
        View decorView = activity.getWindow().getDecorView();
        WritableMap noResult = Arguments.createMap();
        noResult.putBoolean("scrollable", false);

        if (decorView == null) {
            if (SCROLL_DEBUG) {
                Log.d(TAG, "isScrollable: No decor view");
            }
            return noResult;
        }

        // Reset lock for each new story detection
        lockedScrollView = null;

        String unusableReason = CompiledCore.unusableReason();
        if (unusableReason != null) {
            Log.w(TAG, "isScrollable: the C core cannot decide - " + unusableReason);
            return noResult;
        }

        // BFS from root to find the best user-facing scrollable view
        View candidate = findBestScrollViewBFS(decorView);

        if (candidate == null) {
            if (SCROLL_DEBUG) {
                Log.d(TAG, "isScrollable: No scrollable candidate found");
            }
            return noResult;
        }

        if (SCROLL_DEBUG) {
            Log.d(TAG, "isScrollable: Candidate found via BFS, class: " + candidate.getClass().getSimpleName());
        }

        // Suppress scroll indicators for the duration of testing
        candidate.setVerticalScrollBarEnabled(false);
        candidate.setHorizontalScrollBarEnabled(false);

        boolean scrollable = isScrollableByMetrics(candidate);

        if (!scrollable) {
            scrollable = validateWithNudge(candidate);
            if (SCROLL_DEBUG) {
                Log.d(TAG, "isScrollable: Nudge validation result: " + scrollable);
            }
        } else {
            if (SCROLL_DEBUG) {
                Log.d(TAG, "isScrollable: Metric check passed");
            }
        }

        if (!scrollable) {
            return noResult;
        }

        // Lock the candidate for reuse in scrollToCheckpoint()
        lockedScrollView = candidate;

        WritableMap frame = getScrollViewFrameInPixels(candidate);
        WritableMap result = Arguments.createMap();
        result.putBoolean("scrollable", true);
        result.putMap("scrollViewFrame", frame);
        return result;
    }

    /**
     * BFS traversal from root to find the first (shallowest / most-wrapping) scrollable view.
     * BFS guarantees breadth-first order so the outermost scrollable view is found first. The C core
     * judges each view that can scroll vertically as the walk reaches it - VISIBLE and not
     * framework-internal, then scrollable by its numbers and big enough - and the walk stops at the
     * first that fits. Only an eligible view has its range read, as before.
     */
    private View findBestScrollViewBFS(View root) {
        java.util.LinkedList<View> queue = new java.util.LinkedList<>();
        queue.add(root);

        while (!queue.isEmpty()) {
            View view = queue.poll();

            if (view.canScrollVertically(1) || view.canScrollVertically(-1)) {
                String className = view.getClass().getName();
                boolean isShown = view.getVisibility() == View.VISIBLE;
                if (CompiledCore.nativeScrollCandidateIsEligible(className, isShown)) {
                    int height = view.getHeight();
                    int range = getScrollRangeViaReflection(view);
                    // Check minimum area - skip tiny scrollable views (toasts, badges, etc.)
                    android.graphics.Rect rect = new android.graphics.Rect();
                    if (CompiledCore.nativeScrollIsScrollable(true, isShown, height, range) && view.getGlobalVisibleRect(rect)) {
                        boolean fits = CompiledCore.nativeScrollCandidateFits(className, isShown, height, range, true,
                                rect.width(), rect.height(), root.getWidth(), root.getHeight());
                        if (fits) {
                            if (SCROLL_DEBUG) {
                                Log.d(TAG, "BFS: Found scrollable view " + view.getClass().getSimpleName());
                            }
                            return view;
                        }
                        if (SCROLL_DEBUG) {
                            Log.d(TAG, "BFS: Skipping too-small scrollable view " + view.getClass().getSimpleName());
                        }
                    }
                }
            }

            if (view instanceof android.view.ViewGroup) {
                android.view.ViewGroup group = (android.view.ViewGroup) view;
                for (int i = 0; i < group.getChildCount(); i++) {
                    queue.add(group.getChildAt(i));
                }
            }
        }

        return null;
    }

    /**
     * Returns the scroll view's frame in physical pixels (global screen coordinates).
     *
     * Uses getLocationInWindow + view.getWidth()/view.getHeight() instead of
     * getGlobalVisibleRect so that partially-clipped views (e.g. when the bottom
     * of the scroll container sits just above the keyboard or navigation bar) still
     * report their full logical dimensions rather than the clipped visible rect.
     */
    private WritableMap getScrollViewFrameInPixels(View view) {
        int[] location = new int[2];
        view.getLocationInWindow(location);
        WritableMap frame = Arguments.createMap();
        frame.putInt("x", location[0]);
        frame.putInt("y", location[1]);
        frame.putInt("width", view.getWidth());
        frame.putInt("height", view.getHeight());
        return frame;
    }

    /**
     * Metric-based check for scrollability: the view's numbers, judged by the C core. A range that
     * cannot be read leaves the platform's own word that the view can scroll.
     */
    private boolean isScrollableByMetrics(View view) {
        boolean canScroll = view.canScrollVertically(1) || view.canScrollVertically(-1);
        boolean isShown = view.getVisibility() == View.VISIBLE;
        // Use view height as extent (viewport height)
        int height = view.getHeight();
        // Try to get scroll range using reflection since computeVerticalScrollRange is protected
        int range = getScrollRangeViaReflection(view);

        if (SCROLL_DEBUG) {
            Log.d(TAG, "Scroll metrics - range: " + range + ", extent: " + height + ", canScroll: " + canScroll);
        }

        return CompiledCore.nativeScrollIsScrollable(canScroll, isShown, height, range);
    }

    /**
     * Get vertical scroll range using reflection since the method is protected.
     */
    private int getScrollRangeViaReflection(View view) {
        try {
            java.lang.reflect.Method method = View.class.getDeclaredMethod("computeVerticalScrollRange");
            method.setAccessible(true);
            return (Integer) method.invoke(view);
        } catch (Exception e) {
            if (SCROLL_DEBUG) {
                Log.d(TAG, "Failed to get scroll range via reflection: " + e.getMessage());
            }
            return -1;
        }
    }

    /**
     * Get vertical scroll offset using reflection since the method is protected.
     */
    private int getScrollOffsetViaReflection(View view) {
        try {
            java.lang.reflect.Method method = View.class.getDeclaredMethod("computeVerticalScrollOffset");
            method.setAccessible(true);
            return (Integer) method.invoke(view);
        } catch (Exception e) {
            if (SCROLL_DEBUG) {
                Log.d(TAG, "Failed to get scroll offset via reflection: " + e.getMessage());
            }
            // Fallback to getScrollY
            return view.getScrollY();
        }
    }

    /**
     * Validate control by tiny nudge + restore: the C core says how far to scroll for each attempt
     * (down, then up), the view is scrolled, read back and scrolled back by what its scrollY moved,
     * and the C core judges whether it moved - by its scrollY or its computed offset.
     */
    private boolean validateWithNudge(View view) {
        int originalScrollY = view.getScrollY();
        int originalOffset = getScrollOffsetViaReflection(view);

        int[] distance = new int[1];
        for (int attempt = 0; CompiledCore.nativeScrollNudgeTarget(attempt, originalOffset, originalScrollY, distance); attempt++) {
            scrollViewBy(view, distance[0]);

            int newScrollY = view.getScrollY();
            int newOffset = getScrollOffsetViaReflection(view);

            // Restore
            scrollViewBy(view, -(newScrollY - originalScrollY));

            boolean moved = CompiledCore.nativeScrollNudgeMoved(originalOffset, originalScrollY, newOffset, newScrollY);

            if (SCROLL_DEBUG) {
                Log.d(TAG, "Nudge " + attempt + ": originalScrollY=" + originalScrollY + ", newScrollY=" + newScrollY +
                           ", originalOffset=" + originalOffset + ", newOffset=" + newOffset + ", moved=" + moved);
            }

            if (moved) {
                return true;
            }
        }

        return false;
    }

    /**
     * Scroll a view by the given amount using the appropriate method.
     * Uses reflection for optional dependencies (RecyclerView, NestedScrollView) to avoid compile-time dependency.
     */
    private void scrollViewBy(View view, int dy) {
        if (view instanceof android.widget.ScrollView) {
            ((android.widget.ScrollView) view).scrollBy(0, dy);
            return;
        }
        
        if (view instanceof android.webkit.WebView) {
            ((android.webkit.WebView) view).scrollBy(0, dy);
            return;
        }
        
        // Try NestedScrollView via reflection (optional dependency)
        if (tryScrollByClassName(view, "androidx.core.widget.NestedScrollView", dy)) {
            return;
        }
        
        // Try RecyclerView via reflection (optional dependency)
        if (tryScrollByClassName(view, "androidx.recyclerview.widget.RecyclerView", dy)) {
            return;
        }
        
        // Generic fallback - use View.scrollBy which is always available
        view.scrollBy(0, dy);
    }

    /**
     * Try to scroll a view if it matches the given class name using reflection.
     * Returns true if the scroll was attempted (class matched), false otherwise.
     */
    private boolean tryScrollByClassName(View view, String className, int dy) {
        try {
            Class<?> clazz = Class.forName(className);
            if (clazz.isInstance(view)) {
                view.scrollBy(0, dy);
                return true;
            }
        } catch (ClassNotFoundException e) {
            // Class not available, skip
        }
        return false;
    }
} 