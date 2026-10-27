#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

@class RCTBridge;

/** The event raised to the JavaScript for each message the connection brings, with its JSON. */
extern NSString * const SHERLO_MESSAGE_EVENT;

/**
 * Core implementation for Sherlo's React Native module.
 * Manages application modes (default, storybook, testing), the app's one connection, and provides
 * UI inspection and UI stability testing.
 */
@interface SherloModuleCore : NSObject

/**
 * Picks the mode. An address handed at launch means testing mode: the connection opens then, and
 * says hello, before any JavaScript runs.
 * @return An initialized instance
 */
- (instancetype)init;

/** Returns the current mode string (e.g. 'default', 'testing', 'storybook'). */
+ (NSString *)currentMode;

/** Who drives this boot's testing walk ('runner' or 'capture'), or nil outside testing mode. */
+ (NSString *)driver;

/** Records that getStorybook() was called; prevents the NOT_DISPLAYED timer from firing. */
+ (void)setGetStorybookCalled;

/** Cancels the pending NOT_DISPLAYED watchdog timer. Safe to call even after it fired. */
+ (void)cancelStorybookNotDisplayedTimer;

/**
 * Where each message the connection brings is handed to the JavaScript: the module whose
 * JavaScript listens now, or nil while none does.
 */
+ (void)setMessageReceiver:(void (^)(NSString *messageJson))messageReceiver;

/**
 * Sends a JS_ERROR over the connection and waits until the socket took it, at most two seconds,
 * so it leaves before the app dies. In testing mode only. Returns YES when the socket took it.
 */
+ (BOOL)sendJsErrorAndWait:(NSString *)name message:(NSString *)message stack:(NSString *)stack;

/**
 * Returns constants exposed to the JavaScript side. In a launch the runner handed an address, it
 * first waits for the runner's settings.
 * @return Dictionary with mode, config, and lastState
 */
- (NSDictionary *)getSherloConstants;

/**
 * The sealed JS core to run, as JSON (see SherloCoreLoader). In a launch the runner handed an
 * address, it first waits for the runner's settings, which carry any newer core.
 */
- (NSString *)loadCore;

/**
 * Sends one message the JavaScript wrote, as JSON, over the connection. A `hello` is not sent on:
 * native code says hello itself, and keeps the JavaScript's version for it.
 */
- (void)sendMessage:(NSString *)messageJson;

/** Opens the connection to the bundler's address, unless a connection is already open. */
- (void)dialBundler:(NSString *)address;

/** The memory the app's process uses, in MB (phys_footprint), or -1 when it cannot be read. */
- (void)getMemoryMb:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject;

/** Starts the app's JavaScript again in the same process; the connection stays open. */
- (void)reloadJavaScript;

/**
 * Toggles between Storybook and default modes.
 * If in default mode, switches to Storybook mode; if in Storybook mode, switches to default mode.
 * 
 * @param bridge The React Native bridge needed for reloading
 */
- (void)toggleStorybook:(RCTBridge *)bridge;

/**
 * Switches to Storybook mode.
 * 
 * @param bridge The React Native bridge needed for reloading
 */
- (void)openStorybook:(RCTBridge *)bridge;

/**
 * Switches to default mode.
 *
 * @param bridge The React Native bridge needed for reloading
 */
- (void)closeStorybook:(RCTBridge *)bridge;

/**
 * Switches to testing mode by reloading the JavaScript, as a capture asks.
 *
 * @param bridge The React Native bridge needed for reloading
 * @param storyId The story to land the reloaded app on directly (as `initialSelection` - see
 *                TestingMode/Storybook.tsx), or empty when there is none to hand over.
 * @param configJson The settings to hand the reloaded app over as `config` - no runner sends a
 *                    capture its settings, so the JS caller sends getConfigOrDefault()'s answer
 *                    instead (see captureTransport.ts).
 */
- (void)openTesting:(RCTBridge *)bridge storyId:(NSString *)storyId configJson:(NSString *)configJson;

/**
 * Sends a NATIVE_ERROR over the connection.
 * @param errorCode The error code (e.g. ERROR_SDK_COMPATIBILITY)
 * @param message Human-readable error description
 */
- (void)sendNativeError:(NSString *)errorCode message:(NSString *)message dataJson:(NSString *)dataJson;

/**
 * Sends a JS_ERROR for module-eval errors caught by the metro __r polyfill, and waits until the
 * socket took it. Must never throw. Returns YES when the socket took it.
 */
- (BOOL)reportEarlyJsError:(NSString *)name message:(NSString *)message stack:(NSString *)stack;

/**
 * Gets inspector data from the current UI hierarchy
 * @param resolve Promise resolver
 * @param reject Promise rejecter
 */
- (void)getInspectorData:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject;

/**
 * Whether each view named by testID (a JSON list) is drawn, from the native view tree: resolves a
 * JSON object of visible, invisible, absent or unreached by testID
 * @param testIDsJson JSON list of testIDs
 * @param resolve Promise resolver
 * @param reject Promise rejecter
 */
- (void)getViewVisibility:(NSString *)testIDsJson resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject;

/**
 * Checks if the UI is stable by comparing screenshots
 * @param requiredMatches Number of matching screenshots needed
 * @param minScreenshotsCount Minimum number of screenshots to take when checking for stability
 * @param intervalMs Interval between checks in milliseconds
 * @param timeoutMs Maximum time to wait in milliseconds
 * @param saveScreenshots Whether to save screenshots to filesystem during tests
 * @param threshold Matching threshold (0.0 to 1.0); smaller values are more sensitive
 * @param includeAA If false, ignore anti-aliased pixels when counting differences
 * @param resolve Promise resolver
 * @param reject Promise rejecter
 */
- (void)stabilize:(double)requiredMatches
        minScreenshotsCount:(double)minScreenshotsCount
        intervalMs:(double)intervalMs
        timeoutMs:(double)timeoutMs
        saveScreenshots:(BOOL)saveScreenshots
        threshold:(double)threshold
        includeAA:(BOOL)includeAA
        resolve:(RCTPromiseResolveBlock)resolve
        reject:(RCTPromiseRejectBlock)reject;

/**
 * Native paint barrier: forces a redraw and resolves on the next
 * real display frame, capped at timeoutMs.
 * @param timeoutMs Cap on how long to wait for a frame (ms)
 * @param resolve Promise resolver called with @YES on frame commit, @NO on timeout
 * @param reject Promise rejecter (unused; the barrier is best-effort)
 */
- (void)awaitFrameCommit:(double)timeoutMs
                 resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject;

/**
 * Hold every animation that loops forever in the app's windows on its first frame, before a
 * picture (SherloAnimationHold). Only where a Sherlo run can follow; a release app outside one
 * keeps its animations. Call on the main queue. YES when one was held.
 */
- (BOOL)holdAnimationsStill;

/**
 * Detects if the currently visible screen can be vertically scrolled for long-screenshot capture.
 * Uses read-only view inspection: finds a primary scroll container, checks scroll metrics,
 * and validates with a small programmatic nudge that is immediately restored.
 *
 * @param resolve Promise resolver called with boolean (true if scrollable, false otherwise)
 * @param reject Promise rejecter called if an error occurs
 */
 - (void)isScrollable:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject;

/**
 * Deterministically scrolls the currently visible screen to a specific checkpoint offset.
 * Used for stitching long screenshots.
 *
 * @param index The checkpoint index (0-based)
 * @param offset The vertical offset per checkpoint (in pixels/points)
 * @param maxIndex The maximum allowed index
 * @param resolve Promise resolver called with scroll result metrics
 * @param reject Promise rejecter called if an error occurs
 */
- (void)scrollToCheckpoint:(double)index
                    offset:(double)offset
                  maxIndex:(double)maxIndex
                   resolve:(RCTPromiseResolveBlock)resolve
                    reject:(RCTPromiseRejectBlock)reject;

/**
 * Touches the app window (InspectorHelper +appWindow) at (x, y), in points, for holdMs, as a finger
 * does (TouchHelper), and resolves what the touch reached once it ended. Rejects only when the app
 * has no window.
 */
- (void)tap:(double)x
          y:(double)y
     holdMs:(double)holdMs
    resolve:(RCTPromiseResolveBlock)resolve
     reject:(RCTPromiseRejectBlock)reject;

/**
 * Drags a finger across the app window (InspectorHelper +appWindow) from (fromX, fromY) to
 * (toX, toY), in points, over durationMs (TouchHelper), and resolves, once the finger lifted, what
 * it went down on, as the tap does. Rejects only when the app has no window.
 */
- (void)swipe:(double)fromX
        fromY:(double)fromY
          toX:(double)toX
          toY:(double)toY
   durationMs:(double)durationMs
      resolve:(RCTPromiseResolveBlock)resolve
       reject:(RCTPromiseRejectBlock)reject;

@end 