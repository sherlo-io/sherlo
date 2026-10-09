#import "SherloModuleCore.h"
#import "CompiledCore.h"
#import "FileSystemHelper.h"
#import "InspectorHelper.h"
#import "ConfigHelper.h"
#import "EasUpdateHelper.h"
#import "StabilityHelper.h"
#import "KeyboardHelper.h"
#import "LastStateHelper.h"
#import "RestartHelper.h"
#import "SherloJsonHelper.h"
#import "ProtocolHelper.h"

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <React/RCTBridge.h>

static NSString *const LOG_TAG = @"SherloModule:Core";

// Mode constants
NSString * const MODE_DEFAULT = @"default";
NSString * const MODE_STORYBOOK = @"storybook";
NSString * const MODE_TESTING = @"testing";

// Driver constants - who drives a testing-mode boot's own walk (see the `driver` field on
// getSherloConstants and TestDriver in SherloModule.ts).
static NSString * const DRIVER_RUNNER = @"runner";
static NSString * const DRIVER_CAPTURE = @"capture";

// Module state
static NSDictionary *config = nil;
static NSDictionary *lastState = nil;
static NSString *currentMode = MODE_DEFAULT;
static NSString *driver = nil;
static NSString *nativeVersion = nil;

// Native NOT_DISPLAYED watchdog timer state
static BOOL getStorybookWasCalled = NO;
static dispatch_block_t storybookNotDisplayedBlock = nil;

// Helper instances
static FileSystemHelper *fileSystemHelper;

/**
 * Core implementation for the Sherlo React Native module.
 * Centralizes all business logic and state management for the module.
 * Handles mode switching, file operations, UI inspection, and stability testing.
 */
@implementation SherloModuleCore

/**
 * Initializes a new instance of the SherloModuleCore.
 * Sets up the core module by initializing helpers and loading configuration.
 * Creates file system helper, loads configuration and last state, and determines initial mode.
 *
 * @return A new SherloModuleCore instance
 */
- (instancetype)init {
    self = [super init];

    fileSystemHelper = [[FileSystemHelper alloc] init];

    nativeVersion = [SherloJsonHelper getNativeVersion];

    config = [ConfigHelper loadConfig:fileSystemHelper];

    if (config) {
        currentMode = [ConfigHelper determineModeFromConfig:config];

        if ([currentMode isEqualToString:MODE_TESTING]) {
            driver = DRIVER_RUNNER;

            [ProtocolHelper writeNativeInitStarted:fileSystemHelper];

            [KeyboardHelper setupKeyboardSwizzling];

            lastState = [LastStateHelper getLastState:fileSystemHelper];

            NSString *requestId = lastState[@"requestId"];

            [ProtocolHelper writeNativeLoaded:fileSystemHelper requestId:requestId];

            // Check for build-time sherlo-storybook-disabled marker spliced into the .app bundle.
            // Written by applySherloTransforms.js when opts.enabled === false.
            // Mirrors Android SherloInitProvider.checkStorybookDisabledMarker().
            NSString *disabledMarkerPath = [[NSBundle mainBundle] pathForResource:@"sherlo-storybook-disabled" ofType:nil];
            if (disabledMarkerPath) {
                [ProtocolHelper writeNativeError:fileSystemHelper
                                       errorCode:@"ERROR_STORYBOOK_DISABLED"
                                         message:@"Storybook is disabled in metro.config.js. Set enabled: true for Sherlo testing builds."
                                        dataJson:@""];
            }

            NSString *easUpdateDeeplink = config[@"easUpdateDeeplink"];
            BOOL consumingDeeplink = NO;
            if (easUpdateDeeplink) {
                consumingDeeplink = [EasUpdateHelper consumeEasUpdateDeeplinkIfNeeded:easUpdateDeeplink];
            }

            // Native NOT_DISPLAYED watchdog: fires if getStorybook() is never called within 30s.
            // The cancel signal arrives via notifyGetStorybookCalled on the native module.
            __block dispatch_block_t block = dispatch_block_create(0, ^{
                if (!getStorybookWasCalled) {
                    [ProtocolHelper writeNativeError:fileSystemHelper
                                           errorCode:@"ERROR_STORYBOOK_NOT_DISPLAYED"
                                             message:@"Storybook did not appear within 30s of app launch"
                                            dataJson:@""];
                    NSLog(@"[%@] ERROR_STORYBOOK_NOT_DISPLAYED written by native timer", LOG_TAG);
                }
            });
            storybookNotDisplayedBlock = block;
            dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 30 * NSEC_PER_SEC),
                           dispatch_get_main_queue(),
                           block);
            NSLog(@"[%@] storybookNotDisplayed native timer scheduled (30s)", LOG_TAG);

        }
    }

    return self;
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
 * Returns constants that will be exposed to JavaScript.
 * Includes mode constants, current mode, and configuration.
 *
 * @return Dictionary of constants
 */
- (NSDictionary *)getSherloConstants {
    NSString *configString = nil;
    if (config) {
        NSError *error = nil;
        NSData *jsonData = [NSJSONSerialization dataWithJSONObject:config options:0 error:&error];
        if (!error) {
        configString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
        }
    }

    NSString *lastStateString = nil;
    if (lastState) {
        NSError *error = nil;
        NSData *jsonData = [NSJSONSerialization dataWithJSONObject:lastState options:0 error:&error];
        if (!error) {
            lastStateString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
        }
    }
    
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
 * Switches to testing mode and reloads the React Native application.
 * The restart a capture asks for: the same reload `sherlo open` uses, but into
 * testing mode so the app comes back up with isRunningVisualTests true.
 *
 * THE FULL SET OF CRITERIA SURVIVES THE RELOAD FOR FREE. Unlike Android's ProcessPhoenix, this
 * reload never kills the process (see RestartHelper.m) - `config`, `lastState` and `driver` are all
 * statics, so setting them here, before the reload, is enough for them to still be there once the
 * JS context comes back up. No persistence needed: this class's `init` only overwrites them from a
 * config.sherlo a capture never writes (see the top of this file), so the values set here are what
 * a capture's first story reads back through getConfig()/getLastState() - the exact shape a real
 * run's own config.sherlo/protocol.sherlo produce, with an empty requestId because a capture has
 * none (matching LastStateHelper's own default for the same field).
 *
 * @param bridge The React Native bridge needed for reloading
 * @param storyId The story to land the restarted app on directly, or empty when there is none.
 * @param configJson The config to hand over as `config` - the caller's getConfigOrDefault()
 *                    answer, since a capture has no config.sherlo of its own to send.
 */
- (void)openTesting:(RCTBridge *)bridge storyId:(NSString *)storyId configJson:(NSString *)configJson {
    currentMode = MODE_TESTING;
    driver = DRIVER_CAPTURE;

    if (configJson.length > 0) {
        NSData *jsonData = [configJson dataUsingEncoding:NSUTF8StringEncoding];
        NSError *jsonError = nil;
        NSDictionary *parsedConfig = [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:&jsonError];
        if (!jsonError && parsedConfig) {
            config = parsedConfig;
        } else {
            NSLog(@"[%@] Failed to parse config handed over from a capture's restart: %@", LOG_TAG, jsonError.localizedDescription);
        }
    }

    if (storyId.length > 0) {
        lastState = @{ @"nextSnapshot": @{ @"storyId": storyId }, @"requestId": @"" };
    }

    [RestartHelper restart:bridge];
}

/**
 * Writes a NATIVE_ERROR JSON line to protocol.sherlo.
 *
 * @param errorCode The error code (e.g. ERROR_SDK_COMPATIBILITY)
 * @param message Human-readable error description
 */
- (void)sendNativeError:(NSString *)errorCode message:(NSString *)message dataJson:(NSString *)dataJson {
    [ProtocolHelper writeNativeError:fileSystemHelper errorCode:errorCode message:message dataJson:dataJson];
}

- (BOOL)reportEarlyJsError:(NSString *)name message:(NSString *)message stack:(NSString *)stack {
    NSLog(@"[diag native] reportEarlyJsError CALLED with: %@/%@", name ?: @"(nil)", message ?: @"(nil)");
    [fileSystemHelper appendFile:@"sherlo-diag.log"
                         content:[NSString stringWithFormat:@"[diag native] reportEarlyJsError CALLED with: %@/%@\n", name ?: @"(nil)", message ?: @"(nil)"]];
    // Defense in depth: even if the JS-side gate (metro/polyfill.js) is bypassed,
    // refuse to write JS errors to protocol.sherlo unless in testing mode. This
    // makes a polyfill-bug failure mode 'no error captured' not 'protocol polluted'.
    if (![currentMode isEqualToString:MODE_TESTING]) {
        NSLog(@"[diag native] reportEarlyJsError: mode=%@ (not testing) - returning NO", currentMode);
        [fileSystemHelper appendFile:@"sherlo-diag.log"
                             content:[NSString stringWithFormat:@"[diag native] reportEarlyJsError: mode=%@ (not testing) - returning NO\n", currentMode]];
        return NO;
    }
    BOOL result = [ProtocolHelper writeEarlyJsError:fileSystemHelper name:name message:message stack:stack];
    NSLog(@"[diag native] reportEarlyJsError returning - write completed, result=%d", result);
    [fileSystemHelper appendFile:@"sherlo-diag.log"
                         content:[NSString stringWithFormat:@"[diag native] reportEarlyJsError returning - write completed, result=%d\n", result]];
    return result;
}

/**
 * Appends base64 encoded content to a file.
 * Creates the file if it doesn't exist, and any necessary parent directories.
 *
 * @param filename The filename relative to the sync directory
 * @param content The base64 encoded content to append
 * @param resolve Promise resolver called when the operation completes
 * @param reject Promise rejecter called if an error occurs
 */
- (void)appendFile:(NSString *)filename withContent:(NSString *)content resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [fileSystemHelper appendFileWithPromise:filename base64Content:content resolve:resolve reject:reject];
}

/**
 * Reads a file and returns its contents as base64 encoded string.
 *
 * @param filename The filename relative to the sync directory
 * @param resolve Promise resolver called with the base64 encoded file content
 * @param reject Promise rejecter called if an error occurs
 */
- (void)readFile:(NSString *)filename resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [fileSystemHelper readFileWithPromise:filename resolve:resolve reject:reject];
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