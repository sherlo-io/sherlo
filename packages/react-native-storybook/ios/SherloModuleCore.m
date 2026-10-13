#import "SherloModuleCore.h"
#import "CompiledCore.h"
#import "InspectorHelper.h"
#import "EasUpdateHelper.h"
#import "StabilityHelper.h"
#import "KeyboardHelper.h"
#import "RestartHelper.h"
#import "SherloJsonHelper.h"
#import "SherloCoreLoader.h"
#import "SherloLine.h"

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <React/RCTBridge.h>
#import <mach/mach.h>

static NSString *const LOG_TAG = @"SherloModule:Core";

NSString * const SHERLO_MESSAGE_EVENT = @"SherloMessage";

// Mode constants
static NSString * const MODE_DEFAULT = @"default";
static NSString * const MODE_STORYBOOK = @"storybook";
static NSString * const MODE_TESTING = @"testing";

// Driver constants - who drives a testing-mode boot's own walk (see the `driver` field on
// getSherloConstants and TestDriver in SherloModule.ts).
static NSString * const DRIVER_RUNNER = @"runner";
static NSString * const DRIVER_CAPTURE = @"capture";

/**
 * How long a launch the runner handed an address waits for the runner's settings before its
 * JavaScript starts without them. The runner answers hello at once over loopback; this only keeps a
 * launch whose runner is gone from standing still forever.
 */
static const double RUN_SETTINGS_WAIT_SECONDS = 20;

/** How long an error sent as the app dies may take to leave, at most. */
static const double DYING_ERROR_WAIT_SECONDS = 2;

// Module state. Every restart Sherlo makes on iOS only reloads the JavaScript (see RestartHelper),
// so all of it lives as long as the process: the mode and the address handed at launch beside it,
// the connection, the run's settings and the story to show next.
static NSString *currentMode = MODE_DEFAULT;
static NSString *driver = nil;
static NSString *addressHandedAtLaunch = nil;
static SherloLine *line = nil;
static NSString *nativeVersion = nil;
/** The `settings` of the runner's `config`, or a capture's; nil until either arrives. */
static NSDictionary *runSettings = nil;
/** The story the runner named last, as the last-state call hands it to the JavaScript. */
static NSDictionary *lastState = nil;
/** Left once the first `config` arrived, in a launch the runner handed an address. */
static dispatch_group_t runSettingsArrival = nil;
static void (^messageReceiver)(NSString *messageJson) = nil;

// Native NOT_DISPLAYED watchdog timer state
static BOOL getStorybookWasCalled = NO;
static dispatch_block_t storybookNotDisplayedBlock = nil;

/**
 * Core implementation for the Sherlo React Native module.
 * Centralizes all business logic and state management for the module.
 * Handles mode switching, the app's connection, UI inspection, and stability testing.
 */
@implementation SherloModuleCore

/**
 * Picks the mode at launch. An address handed at launch means testing mode: the connection opens,
 * says hello and reports the native load before any JavaScript runs, so a crash at the top of the
 * bundle still leaves a trace. With no address the app opens nothing and runs as built.
 *
 * @return A new SherloModuleCore instance
 */
- (instancetype)init {
    self = [super init];

    nativeVersion = [SherloJsonHelper getNativeVersion];
    addressHandedAtLaunch = [SherloLine addressHandedAtLaunch];

    if (addressHandedAtLaunch) {
        currentMode = MODE_TESTING;
        driver = DRIVER_RUNNER;

        runSettingsArrival = dispatch_group_create();
        dispatch_group_enter(runSettingsArrival);
        [SherloModuleCore openLineTo:addressHandedAtLaunch];

        [SherloModuleCore send:@{ @"action": @"NATIVE_INIT_STARTED" }];

        [KeyboardHelper setupKeyboardSwizzling];

        [SherloModuleCore send:@{ @"action": @"NATIVE_LOADED" }];

        // Check for build-time sherlo-storybook-disabled marker spliced into the .app bundle.
        // Mirrors Android SherloInitProvider.checkStorybookDisabledMarker().
        NSString *disabledMarkerPath = [[NSBundle mainBundle] pathForResource:@"sherlo-storybook-disabled" ofType:nil];
        if (disabledMarkerPath) {
            [SherloModuleCore sendNativeErrorCode:@"ERROR_STORYBOOK_DISABLED"
                                          message:@"Storybook is disabled in metro.config.js. Set enabled: true for Sherlo testing builds."
                                             data:nil];
        }

        // Native NOT_DISPLAYED watchdog: fires if getStorybook() is never called within 30s.
        // The cancel signal arrives via notifyGetStorybookCalled on the native module.
        __block dispatch_block_t block = dispatch_block_create(0, ^{
            if (!getStorybookWasCalled) {
                [SherloModuleCore sendNativeErrorCode:@"ERROR_STORYBOOK_NOT_DISPLAYED"
                                              message:@"Storybook did not appear within 30s of app launch"
                                                 data:nil];
                NSLog(@"[%@] ERROR_STORYBOOK_NOT_DISPLAYED sent by native timer", LOG_TAG);
            }
        });
        storybookNotDisplayedBlock = block;
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 30 * NSEC_PER_SEC),
                       dispatch_get_main_queue(),
                       block);
        NSLog(@"[%@] storybookNotDisplayed native timer scheduled (30s)", LOG_TAG);
    }

    return self;
}

#pragma mark - The connection

/** Opens the app's one connection; every message it brings goes to receiveMessage:. */
+ (void)openLineTo:(NSString *)address {
    line = [[SherloLine alloc] initWithAddress:address
                                 nativeVersion:nativeVersion
                                     onMessage:^(NSDictionary *message) {
        [SherloModuleCore receiveMessage:message];
    }];
    [line open];
}

/** Sends one message, when there is a connection to send it on. */
+ (void)send:(NSDictionary *)message {
    [line send:message];
}

+ (void)sendNativeErrorCode:(NSString *)errorCode message:(NSString *)message data:(NSDictionary *)data {
    NSMutableDictionary *nativeError = [@{
        @"action": @"NATIVE_ERROR",
        @"errorCode": errorCode ?: @"",
        @"message": message ?: @"",
    } mutableCopy];
    if (data) nativeError[@"data"] = data;
    [self send:nativeError];
}

+ (BOOL)sendJsErrorAndWait:(NSString *)name message:(NSString *)message stack:(NSString *)stack {
    if (![currentMode isEqualToString:MODE_TESTING] || !line) return NO;

    NSDictionary *jsError = @{
        @"action": @"JS_ERROR",
        @"data": @{
            @"name": name ?: @"Error",
            @"message": message ?: @"",
            @"stack": stack ?: @"",
            @"componentStack": @[],
            @"digest": [NSNull null],
            @"cause": [NSNull null],
        },
    };
    return [line sendAndWaitUntilSent:jsError timeoutSeconds:DYING_ERROR_WAIT_SECONDS];
}

/**
 * One message the connection brought, on the connection's queue. Native code acts on two itself:
 * `config` before the JavaScript starts, and `story` by reloading the JavaScript. Every message is
 * then handed to the JavaScript listening now, if any.
 */
+ (void)receiveMessage:(NSDictionary *)message {
    id action = message[@"action"];
    if ([action isEqual:@"config"]) {
        [self keepRunSettings:message];
    } else if ([action isEqual:@"story"]) {
        [self showStory:message];
    }

    void (^receiver)(NSString *) = nil;
    @synchronized(self) {
        receiver = messageReceiver;
    }
    if (!receiver) return;
    NSString *messageJson = [self jsonOf:message];
    if (messageJson) receiver(messageJson);
}

/** The runner's `config`: its settings for every start of the JavaScript, and any newer core. */
+ (void)keepRunSettings:(NSDictionary *)config {
    NSDictionary *settings = config[@"settings"];
    if ([settings isKindOfClass:[NSDictionary class]]) {
        @synchronized(self) {
            runSettings = settings;
        }
    }

    NSDictionary *jsCore = config[@"jsCore"];
    if ([jsCore isKindOfClass:[NSDictionary class]]) {
        [SherloCoreLoader keepSentCore:jsCore[@"source"] signature:jsCore[@"signature"]];
    }

    // A `config` comes after every hello; only the first one, at launch, is waited for.
    dispatch_group_t arrival;
    @synchronized(self) {
        arrival = runSettingsArrival;
        runSettingsArrival = nil;
    }
    if (!arrival) return;

    NSString *easUpdateDeeplink = settings[@"easUpdateDeeplink"];
    if ([easUpdateDeeplink isKindOfClass:[NSString class]]) {
        [EasUpdateHelper consumeEasUpdateDeeplinkIfNeeded:easUpdateDeeplink];
    }
    dispatch_group_leave(arrival);
}

/** The runner's `story`: kept for the next start of the JavaScript, which shows it. */
+ (void)showStory:(NSDictionary *)story {
    NSDictionary *parameters = [story[@"parameters"] isKindOfClass:[NSDictionary class]] ? story[@"parameters"] : @{};
    @synchronized(self) {
        lastState = @{
            @"nextSnapshot": @{ @"storyId": story[@"storyId"] ?: @"", @"parameters": parameters },
            @"requestId": story[@"requestId"] ?: @"",
        };
    }
    [RestartHelper restart:nil];
}

/** In a launch the runner handed an address, wait for its first `config`, at most a while. */
+ (void)waitForRunSettings {
    dispatch_group_t arrival;
    @synchronized(self) {
        arrival = runSettingsArrival;
    }
    if (!arrival) return;

    dispatch_time_t deadline = dispatch_time(DISPATCH_TIME_NOW, (int64_t)(RUN_SETTINGS_WAIT_SECONDS * NSEC_PER_SEC));
    if (dispatch_group_wait(arrival, deadline) != 0) {
        NSLog(@"[%@] The runner sent no settings within %.0fs; the JavaScript starts without them", LOG_TAG, RUN_SETTINGS_WAIT_SECONDS);
    }
}

+ (void)setMessageReceiver:(void (^)(NSString *messageJson))receiver {
    @synchronized(self) {
        messageReceiver = [receiver copy];
    }
}

- (NSString *)loadCore {
    [SherloModuleCore waitForRunSettings];
    return [SherloCoreLoader loadCoreJson];
}

- (void)sendMessage:(NSString *)messageJson {
    NSData *json = [messageJson dataUsingEncoding:NSUTF8StringEncoding];
    id message = json ? [NSJSONSerialization JSONObjectWithData:json options:0 error:nil] : nil;
    if (![message isKindOfClass:[NSDictionary class]]) {
        NSLog(@"[%@] sendMessage: not a JSON object, not sent", LOG_TAG);
        return;
    }

    if ([message[@"action"] isEqual:@"hello"]) {
        id jsVersion = message[@"jsVersion"];
        [line setJsVersion:[jsVersion isKindOfClass:[NSString class]] ? jsVersion : nil];
        return;
    }
    [SherloModuleCore send:message];
}

/**
 * Dials the bundler the bundle was served from, whatever its host: a physical iPhone reaches it on
 * the local network. Only the address the runner hands at launch must name this machine. The line
 * dials without TLS, so the address is ws:// alone.
 */
- (void)dialBundler:(NSString *)address {
    if (line || address.length == 0) return;
    if (![[NSURL URLWithString:address].scheme isEqualToString:@"ws"]) {
        NSLog(@"[%@] Not dialling the bundler: its address is not ws:// (%@)", LOG_TAG, address);
        return;
    }
    [SherloModuleCore openLineTo:address];
}

- (void)getMemoryMb:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    task_vm_info_data_t memoryInfo;
    mach_msg_type_number_t memoryInfoCount = TASK_VM_INFO_COUNT;
    kern_return_t result = task_info(mach_task_self(), TASK_VM_INFO, (task_info_t)&memoryInfo, &memoryInfoCount);
    if (result != KERN_SUCCESS) {
        resolve(@(-1));
        return;
    }
    resolve(@(round(memoryInfo.phys_footprint / (1024.0 * 1024.0))));
}

- (void)reloadJavaScript {
    [RestartHelper restart:nil];
}

+ (void)setGetStorybookCalled {
    getStorybookWasCalled = YES;
}

+ (void)cancelStorybookNotDisplayedTimer {
    if (storybookNotDisplayedBlock) {
        dispatch_block_cancel(storybookNotDisplayedBlock);
        storybookNotDisplayedBlock = nil;
    }
}

+ (NSString *)currentMode {
    return currentMode ?: MODE_DEFAULT;
}

+ (NSString *)driver {
    return driver;
}

/**
 * Returns constants that will be exposed to JavaScript: the mode, the run's settings as `config`,
 * and the story to show as `lastState`. Read at every start of the JavaScript.
 *
 * @return Dictionary of constants
 */
- (NSDictionary *)getSherloConstants {
    [SherloModuleCore waitForRunSettings];

    NSDictionary *settings;
    NSDictionary *story;
    @synchronized([SherloModuleCore class]) {
        settings = runSettings;
        story = lastState;
    }
    NSString *configString = [SherloModuleCore jsonOf:settings];
    NSString *lastStateString = [SherloModuleCore jsonOf:story];

    // The C core's version, for the START that reports which core ran. Only a run reads it, so it
    // is asked for in testing mode only, as on Android.
    NSString *compiledCoreVersion = [currentMode isEqualToString:MODE_TESTING] ? CompiledCoreVersion() : nil;

    return @{
        @"mode": currentMode,
        @"config": configString ?: [NSNull null],
        @"lastState": lastStateString ?: [NSNull null],
        @"nativeVersion": nativeVersion ?: [NSNull null],
        @"driver": driver ?: [NSNull null],
        @"compiledCoreVersion": compiledCoreVersion ?: [NSNull null]
    };
}

/** The object as a JSON string, or nil when there is none or it is not JSON. */
+ (NSString *)jsonOf:(NSDictionary *)object {
    if (!object) return nil;
    NSData *json = [NSJSONSerialization dataWithJSONObject:object options:0 error:nil];
    return json ? [[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding] : nil;
}

/**
 * Toggles between Storybook and default modes.
 * If in default mode, switches to Storybook mode; if in Storybook mode, switches to default mode.
 *
 * @param bridge The React Native bridge needed for reloading
 */
- (void)toggleStorybook:(RCTBridge *)bridge {
    if ([currentMode isEqualToString:MODE_STORYBOOK]) {
        currentMode = MODE_DEFAULT;
    } else {
        currentMode = MODE_STORYBOOK;
    }

    [RestartHelper restart:bridge];
}

/**
 * Switches to Storybook mode and reloads the React Native application.
 * Updates the current mode, saves state, and triggers a reload.
 *
 * @param bridge The React Native bridge needed for reloading
 */
- (void)openStorybook:(RCTBridge *)bridge {
    currentMode = MODE_STORYBOOK;
    [RestartHelper restart:bridge];
}

/**
 * Switches to default mode and reloads the React Native application.
 * Updates the current mode, saves state, and triggers a reload.
 *
 * @param bridge The React Native bridge needed for reloading
 */
- (void)closeStorybook:(RCTBridge *)bridge {
    currentMode = MODE_DEFAULT;
    [RestartHelper restart:bridge];
}

/**
 * Switches to testing mode by reloading the JavaScript: how a capture moves the app, so
 * isRunningVisualTests is true when the JavaScript starts again. The process and its connection
 * stay (see RestartHelper), so the mode, the settings and the story set here are what the new
 * start reads back through getConfig()/getLastState(), with an empty requestId because a capture
 * has none.
 *
 * @param bridge The React Native bridge needed for reloading
 * @param storyId The story to land the reloaded app on directly, or empty when there is none.
 * @param configJson The settings to hand over as `config` - the caller's getConfigOrDefault()
 *                    answer, since no runner sends a capture its settings.
 */
- (void)openTesting:(RCTBridge *)bridge storyId:(NSString *)storyId configJson:(NSString *)configJson {
    currentMode = MODE_TESTING;
    driver = DRIVER_CAPTURE;

    if (configJson.length > 0) {
        NSData *jsonData = [configJson dataUsingEncoding:NSUTF8StringEncoding];
        NSError *jsonError = nil;
        NSDictionary *captureSettings = [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:&jsonError];
        if (!jsonError && [captureSettings isKindOfClass:[NSDictionary class]]) {
            @synchronized([SherloModuleCore class]) {
                runSettings = captureSettings;
            }
        } else {
            NSLog(@"[%@] Failed to parse the settings a capture handed over: %@", LOG_TAG, jsonError.localizedDescription);
        }
    }

    if (storyId.length > 0) {
        @synchronized([SherloModuleCore class]) {
            lastState = @{ @"nextSnapshot": @{ @"storyId": storyId }, @"requestId": @"" };
        }
    }

    [RestartHelper restart:bridge];
}

/**
 * Sends a NATIVE_ERROR over the connection.
 *
 * @param errorCode The error code (e.g. ERROR_SDK_COMPATIBILITY)
 * @param message Human-readable error description
 * @param dataJson The error's data as JSON, or empty when it has none
 */
- (void)sendNativeError:(NSString *)errorCode message:(NSString *)message dataJson:(NSString *)dataJson {
    NSDictionary *data = nil;
    if (dataJson.length > 0) {
        id parsedData = [NSJSONSerialization JSONObjectWithData:[dataJson dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];
        if ([parsedData isKindOfClass:[NSDictionary class]]) data = parsedData;
    }
    [SherloModuleCore sendNativeErrorCode:errorCode message:message data:data];
}

/**
 * Defense in depth: even if the JS-side gate (metro/polyfill.js) is bypassed, a JS error is sent in
 * testing mode only, so a polyfill bug means 'no error captured', never a stray report.
 */
- (BOOL)reportEarlyJsError:(NSString *)name message:(NSString *)message stack:(NSString *)stack {
    return [SherloModuleCore sendJsErrorAndWait:name message:message stack:stack];
}

/**
 * Gets UI inspector data from the current view hierarchy.
 * Returns a promise with serialized JSON containing detailed view information.
 *
 * @param resolve Promise resolver called with the inspector data
 * @param reject Promise rejecter called if an error occurs
 */
- (void)getInspectorData:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [InspectorHelper getInspectorData:resolve reject:reject];
}

/**
 * Checks UI stability by comparing screenshots taken over a specified interval.
 * Returns a promise with a boolean indicating if the UI is stable.
 *
 * @param requiredMatches Number of consecutive matches needed
 * @param minScreenshotsCount Minimum number of screenshots to take when checking for stability
 * @param intervalMs Time interval in milliseconds
 * @param timeoutMs Timeout in milliseconds
 * @param saveScreenshots Whether to save screenshots to filesystem during tests
 * @param threshold Matching threshold (0.0 to 1.0); smaller values are more sensitive
 * @param includeAA If false, ignore anti-aliased pixels when counting differences
 * @param resolve Promise resolver called with the stability result
 * @param reject Promise rejecter called if an error occurs
 */
- (void)stabilize:(double)requiredMatches
        minScreenshotsCount:(double)minScreenshotsCount
        intervalMs:(double)intervalMs
        timeoutMs:(double)timeoutMs
        saveScreenshots:(BOOL)saveScreenshots
        threshold:(double)threshold
        includeAA:(BOOL)includeAA
        resolve:(RCTPromiseResolveBlock)resolve
        reject:(RCTPromiseRejectBlock)reject {
    [StabilityHelper stabilize:(NSInteger)requiredMatches minScreenshotsCount:(NSInteger)minScreenshotsCount intervalMs:(NSInteger)intervalMs timeoutMs:(NSInteger)timeoutMs saveScreenshots:saveScreenshots threshold:threshold includeAA:includeAA resolve:resolve reject:reject];
}

// Native paint barrier: force a redraw and resolve on the next
// real display frame (CADisplayLink), capped at timeoutMs.
- (void)awaitFrameCommit:(double)timeoutMs
                 resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject {
    [StabilityHelper awaitFrameCommit:timeoutMs resolve:resolve reject:reject];
}

#pragma mark - Scroll Detection

// Debug flag for logging scroll detection
static BOOL const SCROLL_DEBUG = YES;

// Locked scroll view from isScrollable(), reused by scrollToCheckpoint()
static UIScrollView *lockedScrollView = nil;

/**
 * Detects if the currently visible screen has a vertically scrollable view suitable for long-screenshot capture.
 * Resolves with a dictionary: {scrollable: BOOL, scrollViewFrame?: {x, y, width, height}} in physical pixels.
 */
- (void)isScrollable:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    dispatch_async(dispatch_get_main_queue(), ^{
        @try {
            NSDictionary *result = [self detectScrollableView];
            resolve(result);
        } @catch (NSException *exception) {
            if (SCROLL_DEBUG) {
                NSLog(@"[%@] isScrollable exception: %@", LOG_TAG, exception);
            }
            resolve(@{@"scrollable": @(NO)});
        }
    });
}

/**
 * Main detection logic for scrollable views. Returns a result dict with scrollable + optional frame.
 */
- (NSDictionary *)detectScrollableView {
    // Reset lock for each new story detection
    lockedScrollView = nil;

    NSString *unusableReason = CompiledCoreUnusableReason();
    if (unusableReason) {
        NSLog(@"[%@] isScrollable: the C core cannot decide - %@", LOG_TAG, unusableReason);
        return @{@"scrollable": @(NO)};
    }

    UIWindow *keyWindow = [self getKeyWindow];
    if (!keyWindow) {
        if (SCROLL_DEBUG) {
            NSLog(@"[%@] isScrollable: No key window found", LOG_TAG);
        }
        return @{@"scrollable": @(NO)};
    }

    // BFS from root to find the first user-facing scrollable view
    UIScrollView *candidate = [self findBestScrollViewBFS:keyWindow];

    if (!candidate) {
        if (SCROLL_DEBUG) {
            NSLog(@"[%@] isScrollable: No scroll view candidate found", LOG_TAG);
        }
        return @{@"scrollable": @(NO)};
    }

    if (SCROLL_DEBUG) {
        NSLog(@"[%@] isScrollable: Candidate found via BFS, class: %@",
              LOG_TAG, NSStringFromClass([candidate class]));
    }

    // Metric-based scrollability check
    sherlo_scroll_metrics metrics = [self scrollMetricsOf:candidate];
    BOOL scrollable = sherlo_scroll_is_scrollable(SHERLO_PLATFORM_IOS, &metrics) == 1;

    if (!scrollable) {
        // Fallback: nudge and restore
        scrollable = [self validateWithNudge:candidate];
        if (SCROLL_DEBUG) {
            NSLog(@"[%@] isScrollable: Nudge validation result: %@", LOG_TAG, scrollable ? @"YES" : @"NO");
        }
    } else {
        if (SCROLL_DEBUG) {
            NSLog(@"[%@] isScrollable: Metric check passed", LOG_TAG);
        }
    }

    if (!scrollable) {
        return @{@"scrollable": @(NO)};
    }

    // Lock the candidate for reuse in scrollToCheckpoint()
    lockedScrollView = candidate;

    NSDictionary *frame = [self getScrollViewFrameInPhysicalPixels:candidate window:keyWindow];
    return @{
        @"scrollable": @(YES),
        @"scrollViewFrame": frame,
    };
}

/**
 * Get the key window for the current foreground scene.
 */
- (UIWindow *)getKeyWindow {
    if (@available(iOS 13.0, *)) {
        for (UIWindowScene *scene in [UIApplication sharedApplication].connectedScenes) {
            if (scene.activationState == UISceneActivationStateForegroundActive) {
                for (UIWindow *window in scene.windows) {
                    if (window.isKeyWindow) {
                        return window;
                    }
                }
            }
        }
    }
    // Fallback for older iOS
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
    return [UIApplication sharedApplication].keyWindow;
#pragma clang diagnostic pop
}

/**
 * BFS traversal from root to find the first (shallowest / most-wrapping) scrollable UIScrollView.
 * BFS guarantees breadth-first order so the outermost scrollable view is found first. The C core
 * judges each UIScrollView as the walk reaches it - shown and not framework-internal, then
 * scrollable by its numbers and big enough - and the walk stops at the first that fits.
 */
- (UIScrollView *)findBestScrollViewBFS:(UIWindow *)window {
    NSMutableArray<UIView *> *queue = [NSMutableArray array];

    // Walk the view controller presentation chain so modals (presentedViewController) are included.
    // React Native Modal uses presentViewController:animated: - the modal content lives on a
    // presented VC in the same window, not reachable from rootViewController.view alone.
    UIViewController *vc = window.rootViewController;
    while (vc) {
        if (vc.view) {
            [queue addObject:vc.view];
            if (SCROLL_DEBUG) {
                NSLog(@"[%@] BFS: Adding root from VC %@", LOG_TAG, NSStringFromClass([vc class]));
            }
        }
        vc = vc.presentedViewController;
    }

    // Fallback if no VC chain found
    if (queue.count == 0) {
        [queue addObject:window];
    }

    while (queue.count > 0) {
        UIView *view = queue[0];
        [queue removeObjectAtIndex:0];

        if ([view isKindOfClass:[UIScrollView class]]) {
            UIScrollView *scrollView = (UIScrollView *)view;
            NSString *className = NSStringFromClass([scrollView class]);

            // First what is cheap to read: shown, enabled, in a window, not framework-internal.
            sherlo_scroll_candidate candidate;
            memset(&candidate, 0, sizeof(candidate));
            candidate.class_name = className.UTF8String;
            candidate.is_hidden = scrollView.hidden ? 1 : 0;
            candidate.alpha = scrollView.alpha;
            candidate.metrics.can_scroll = scrollView.isScrollEnabled ? 1 : 0;
            candidate.metrics.is_shown = scrollView.window != nil ? 1 : 0;

            if (sherlo_scroll_candidate_is_eligible(SHERLO_PLATFORM_IOS, &candidate) == 1) {
                // Then its numbers and the part of it on screen
                candidate.metrics = [self scrollMetricsOf:scrollView];
                CGRect frameInWindow = [scrollView convertRect:scrollView.bounds toView:window];
                CGRect visible = CGRectIntersection(frameInWindow, window.bounds);
                candidate.is_on_screen = CGRectIsNull(visible) ? 0 : 1;
                candidate.visible_width = CGRectIsNull(visible) ? 0 : visible.size.width;
                candidate.visible_height = CGRectIsNull(visible) ? 0 : visible.size.height;

                if (sherlo_scroll_candidate_fits(SHERLO_PLATFORM_IOS, &candidate, window.bounds.size.width,
                                                 window.bounds.size.height) == 1) {
                    if (SCROLL_DEBUG) {
                        NSLog(@"[%@] BFS: Found scrollable view %@", LOG_TAG, className);
                    }
                    return scrollView;
                }
                if (SCROLL_DEBUG) {
                    NSLog(@"[%@] BFS: Skipping %@ (not scrollable enough, or too small)", LOG_TAG, className);
                }
            }
        }

        for (UIView *subview in view.subviews) {
            [queue addObject:subview];
        }
    }

    return nil;
}

/**
 * A scroll view's vertical numbers, as the C core reads them, in points.
 */
- (sherlo_scroll_metrics)scrollMetricsOf:(UIScrollView *)scrollView {
    sherlo_scroll_metrics metrics;
    metrics.can_scroll = scrollView.isScrollEnabled ? 1 : 0;
    metrics.is_shown = scrollView.window != nil ? 1 : 0;
    metrics.viewport_height = scrollView.bounds.size.height;
    metrics.content_height = scrollView.contentSize.height;
    metrics.inset_top = scrollView.adjustedContentInset.top;
    metrics.inset_bottom = scrollView.adjustedContentInset.bottom;
    metrics.scroll_extent = -1;
    return metrics;
}

/**
 * Returns the scroll view's frame in physical pixels relative to the window origin.
 */
- (NSDictionary *)getScrollViewFrameInPhysicalPixels:(UIScrollView *)scrollView window:(UIWindow *)window {
    CGFloat scale = [UIScreen mainScreen].scale;
    CGRect frameInWindow = [scrollView convertRect:scrollView.bounds toView:window];
    return @{
        @"x": @(frameInWindow.origin.x * scale),
        @"y": @(frameInWindow.origin.y * scale),
        @"width": @(frameInWindow.size.width * scale),
        @"height": @(frameInWindow.size.height * scale),
    };
}

/**
 * Validate control by tiny nudge + restore: the C core says where to move the view, the view is
 * moved, read back and put back, and the C core judges whether it moved.
 */
- (BOOL)validateWithNudge:(UIScrollView *)scrollView {
    sherlo_scroll_metrics metrics = [self scrollMetricsOf:scrollView];
    sherlo_scroll_position original;
    original.offset = scrollView.contentOffset.y;
    original.scroll_y = 0;

    double targetY = 0;
    for (int32_t attempt = 0; sherlo_scroll_nudge_target(SHERLO_PLATFORM_IOS, attempt, &metrics, &original, &targetY) == 1; attempt++) {
        // Apply nudge
        [scrollView setContentOffset:CGPointMake(scrollView.contentOffset.x, targetY) animated:NO];
        [scrollView layoutIfNeeded];

        // Read back
        sherlo_scroll_position applied;
        applied.offset = scrollView.contentOffset.y;
        applied.scroll_y = 0;

        // Restore immediately
        [scrollView setContentOffset:CGPointMake(scrollView.contentOffset.x, original.offset) animated:NO];
        [scrollView layoutIfNeeded];

        BOOL moved = sherlo_scroll_nudge_moved(SHERLO_PLATFORM_IOS, &original, &applied) == 1;
        if (SCROLL_DEBUG) {
            NSLog(@"[%@] Nudge: original=%.1f, target=%.1f, applied=%.1f, moved=%@",
                  LOG_TAG, original.offset, targetY, applied.offset, moved ? @"YES" : @"NO");
        }
        if (moved) {
            return YES;
        }
    }

    if (SCROLL_DEBUG) {
        NSLog(@"[%@] Nudge: Did not move from offset %.1f", LOG_TAG, original.offset);
    }
    return NO;
}

#pragma mark - Checkpoint Scrolling

/**
 * Deterministically scrolls to a checkpoint index.
 */
- (void)scrollToCheckpoint:(double)index
                    offset:(double)offset
                  maxIndex:(double)maxIndex
                   resolve:(RCTPromiseResolveBlock)resolve
                    reject:(RCTPromiseRejectBlock)reject {
    dispatch_async(dispatch_get_main_queue(), ^{
        @try {
            NSDictionary *result = [self performScrollToCheckpoint:(NSInteger)index offset:offset maxIndex:(NSInteger)maxIndex];
            resolve(result);
        } @catch (NSException *exception) {
            if (SCROLL_DEBUG) {
                NSLog(@"[%@] scrollToCheckpoint exception: %@", LOG_TAG, exception);
            }
            // Return failure/sentinel payload
            resolve(@{
                @"reachedBottom": @(YES),
                @"appliedIndex": @(0),
                @"appliedOffsetPx": @(0),
                @"viewportPx": @(0),
                @"contentPx": @(0)
            });
        }
    });
}

- (NSDictionary *)performScrollToCheckpoint:(NSInteger)index offset:(double)offsetPx maxIndex:(NSInteger)maxIndex {
    // 1. Use locked scroll view from isScrollable() - no re-detection
    UIScrollView *candidate = lockedScrollView;

    if (!candidate || !candidate.window) {
        if (SCROLL_DEBUG) {
            NSLog(@"[%@] scrollToCheckpoint: No locked candidate found", LOG_TAG);
        }
        return @{
            @"reachedBottom": @(YES),
            @"appliedIndex": @(0),
            @"appliedOffsetPx": @(0),
            @"viewportPx": @(0),
            @"contentPx": @(0)
        };
    }

    UIWindow *keyWindow = [self getKeyWindow];

    // 2. Plan the checkpoint: the C core keeps the index in range and the target offset, in
    // points, inside the scroll range. The incoming offset is in physical pixels.
    CGFloat scale = [UIScreen mainScreen].scale;
    sherlo_scroll_metrics metrics = [self scrollMetricsOf:candidate];
    sherlo_checkpoint_plan plan;
    sherlo_checkpoint_plan_for(SHERLO_PLATFORM_IOS, index, offsetPx, maxIndex, &metrics, scale, &plan);

    // 3. Apply Scroll
    if (SCROLL_DEBUG) {
        NSLog(@"[%@] Scrolling to index: %lld, targetPt: %.1f", LOG_TAG, (long long)plan.applied_index, plan.target_offset);
    }

    [candidate setContentOffset:CGPointMake(candidate.contentOffset.x, plan.target_offset) animated:NO];
    [candidate layoutIfNeeded];

    // 4. Read Back: the distance scrolled from the top, in pixels, and whether this is the bottom
    sherlo_checkpoint_result result;
    sherlo_checkpoint_read_back(&plan, candidate.contentOffset.y, &result);

    NSDictionary *scrollViewFrame = [self getScrollViewFrameInPhysicalPixels:candidate window:keyWindow];

    return @{
        @"reachedBottom": @(result.reached_bottom == 1),
        @"appliedIndex": @((NSInteger)result.applied_index),
        @"appliedOffsetPx": @(result.applied_offset_px),
        @"viewportPx": @(result.viewport_px),
        @"contentPx": @(result.content_px),
        @"scrollViewFrame": scrollViewFrame,
    };
}

@end