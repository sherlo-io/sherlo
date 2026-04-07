#import "SherloModuleCore.h"
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
#import <React/RCTBridge.h>

static NSString *const LOG_TAG = @"SherloModule:Core";

// Mode constants
NSString * const MODE_DEFAULT = @"default";
NSString * const MODE_STORYBOOK = @"storybook";
NSString * const MODE_TESTING = @"testing";

// Module state
static NSDictionary *config = nil;
static NSDictionary *lastState = nil;
static NSString *currentMode = MODE_DEFAULT;
static NSString *nativeVersion = nil;

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
        
        NSLog(@"[%@] Initialized with mode: %@", LOG_TAG, currentMode);
        
        if ([currentMode isEqualToString:MODE_TESTING]) {
            [KeyboardHelper setupKeyboardSwizzling];

            lastState = [LastStateHelper getLastState:fileSystemHelper];

            NSString *requestId = lastState[@"requestId"];

            [ProtocolHelper writeNativeLoaded:fileSystemHelper requestId:requestId];

            NSString *easUpdateDeeplink = config[@"easUpdateDeeplink"];
            BOOL consumingDeeplink = NO;
            if (easUpdateDeeplink) {
                consumingDeeplink = [EasUpdateHelper consumeEasUpdateDeeplinkIfNeeded:easUpdateDeeplink];
            }
        }
    }

    return self;
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
    
    return @{
        @"mode": currentMode,
        @"config": configString ?: [NSNull null],
        @"lastState": lastStateString ?: [NSNull null],
        @"nativeVersion": nativeVersion ?: [NSNull null]
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
 * Writes a NATIVE_ERROR JSON line to protocol.sherlo.
 *
 * @param errorCode The error code (e.g. ERROR_SDK_COMPATIBILITY)
 * @param message Human-readable error description
 */
- (void)sendNativeError:(NSString *)errorCode message:(NSString *)message {
    [ProtocolHelper writeNativeError:fileSystemHelper errorCode:errorCode message:message];
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
    const CGFloat EPSILON = 4.0;
    const CGFloat NUDGE_PX = 3.0;
    const CGFloat MIN_SCROLL_RANGE_RATIO = 0.20;

    // Reset lock for each new story detection
    lockedScrollView = nil;

    UIWindow *keyWindow = [self getKeyWindow];
    if (!keyWindow) {
        if (SCROLL_DEBUG) {
            NSLog(@"[%@] isScrollable: No key window found", LOG_TAG);
        }
        return @{@"scrollable": @(NO)};
    }

    // BFS from root to find the best user-facing scrollable view
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
    BOOL scrollable = [self isScrollableByMetrics:candidate epsilon:EPSILON minRangeRatio:MIN_SCROLL_RANGE_RATIO];

    if (!scrollable) {
        // Fallback: nudge and restore
        scrollable = [self validateWithNudge:candidate nudgePx:NUDGE_PX];
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
 * BFS traversal from root to find the largest user-facing vertically-scrollable UIScrollView.
 * Filters out framework-internal views (private _-prefixed classes) and views covering < 10% of screen.
 */
- (UIScrollView *)findBestScrollViewBFS:(UIWindow *)window {
    CGFloat screenArea = window.bounds.size.width * window.bounds.size.height;
    CGFloat minArea = screenArea * 0.10;

    UIScrollView *bestCandidate = nil;
    CGFloat bestArea = 0;

    NSMutableArray<UIView *> *queue = [NSMutableArray array];
    UIView *root = window.rootViewController.view ?: window;
    [queue addObject:root];

    while (queue.count > 0) {
        UIView *view = queue[0];
        [queue removeObjectAtIndex:0];

        if ([view isKindOfClass:[UIScrollView class]]) {
            UIScrollView *sv = (UIScrollView *)view;

            BOOL isCandidate = YES;

            // Must be visible, scroll-enabled, and in window
            if (sv.hidden || sv.alpha < 0.01 || !sv.isScrollEnabled || !sv.window) {
                isCandidate = NO;
            }

            // Filter framework-internal scroll views (Apple private classes start with '_')
            if (isCandidate && [self isFrameworkInternalScrollView:sv]) {
                isCandidate = NO;
            }

            if (isCandidate) {
                CGRect frameInWindow = [sv convertRect:sv.bounds toView:window];
                CGRect visible = CGRectIntersection(frameInWindow, window.bounds);

                if (!CGRectIsNull(visible) && !CGRectIsEmpty(visible)) {
                    CGFloat area = visible.size.width * visible.size.height;

                    // Filter views covering less than 10% of screen
                    if (area >= minArea && [self isScrollableByMetrics:sv epsilon:1.0 minRangeRatio:0.01]) {
                        if (area > bestArea) {
                            bestArea = area;
                            bestCandidate = sv;
                        }
                    }
                }
            }
        }

        for (UIView *subview in view.subviews) {
            [queue addObject:subview];
        }
    }

    return bestCandidate;
}

/**
 * Returns YES if the scroll view is a framework-internal view that should not be used as a scroll target.
 */
- (BOOL)isFrameworkInternalScrollView:(UIScrollView *)scrollView {
    NSString *className = NSStringFromClass([scrollView class]);
    // Apple private classes use underscore prefix
    if ([className hasPrefix:@"_"]) {
        return YES;
    }
    return NO;
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
 * Metric-based check for scrollability.
 */
- (BOOL)isScrollableByMetrics:(UIScrollView *)scrollView epsilon:(CGFloat)epsilon minRangeRatio:(CGFloat)minRangeRatio {
    if (!scrollView.isScrollEnabled) {
        return NO;
    }

    CGFloat viewportH = scrollView.bounds.size.height;
    CGFloat contentH = scrollView.contentSize.height;
    UIEdgeInsets insets = scrollView.adjustedContentInset;
    CGFloat totalInsets = insets.top + insets.bottom;
    CGFloat scrollRange = contentH + totalInsets - viewportH;

    if (SCROLL_DEBUG) {
        NSLog(@"[%@] Scroll metrics - viewportH: %.1f, contentH: %.1f, insets: %.1f, scrollRange: %.1f",
              LOG_TAG, viewportH, contentH, totalInsets, scrollRange);
    }

    // Basic checks
    if (viewportH <= 0) {
        return NO;
    }
    if (scrollRange <= epsilon) {
        return NO;
    }

    // Check for meaningful scroll range (at least minRangeRatio of viewport)
    CGFloat minRange = viewportH * minRangeRatio;
    if (scrollRange < minRange) {
        if (SCROLL_DEBUG) {
            NSLog(@"[%@] Scroll range %.1f < minimum %.1f (%.0f%% of viewport)",
                  LOG_TAG, scrollRange, minRange, minRangeRatio * 100);
        }
        return NO;
    }

    // Check if in window and visible
    if (!scrollView.window) {
        return NO;
    }

    return YES;
}

/**
 * Validate control by tiny nudge + restore.
 */
- (BOOL)validateWithNudge:(UIScrollView *)scrollView nudgePx:(CGFloat)nudgePx {
    CGFloat viewportH = scrollView.bounds.size.height;
    CGFloat contentH = scrollView.contentSize.height;
    UIEdgeInsets insets = scrollView.adjustedContentInset;

    CGFloat minY = -insets.top;
    CGFloat maxY = contentH - viewportH + insets.bottom;

    CGFloat originalOffsetY = scrollView.contentOffset.y;
    CGFloat targetY = originalOffsetY + nudgePx;

    // Clamp target
    targetY = MAX(minY, MIN(maxY, targetY));

    // If at clamp limit, try opposite direction
    if (fabs(targetY - originalOffsetY) < 1.0) {
        targetY = originalOffsetY - nudgePx;
        targetY = MAX(minY, MIN(maxY, targetY));
    }

    // If still can't move, fail
    if (fabs(targetY - originalOffsetY) < 1.0) {
        if (SCROLL_DEBUG) {
            NSLog(@"[%@] Nudge: Cannot move from offset %.1f (minY: %.1f, maxY: %.1f)",
                  LOG_TAG, originalOffsetY, minY, maxY);
        }
        return NO;
    }

    // Apply nudge
    [scrollView setContentOffset:CGPointMake(scrollView.contentOffset.x, targetY) animated:NO];
    [scrollView layoutIfNeeded];

    // Read back
    CGFloat appliedOffsetY = scrollView.contentOffset.y;

    // Restore immediately
    [scrollView setContentOffset:CGPointMake(scrollView.contentOffset.x, originalOffsetY) animated:NO];
    [scrollView layoutIfNeeded];

    CGFloat delta = fabs(appliedOffsetY - originalOffsetY);
    if (SCROLL_DEBUG) {
        NSLog(@"[%@] Nudge: original=%.1f, target=%.1f, applied=%.1f, delta=%.1f",
              LOG_TAG, originalOffsetY, targetY, appliedOffsetY, delta);
    }

    return delta >= 1.0;
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
    
    // 2. Compute Metrics
    CGFloat scale = [UIScreen mainScreen].scale;
    CGFloat viewportPt = candidate.bounds.size.height;
    CGFloat contentPt = candidate.contentSize.height;
    CGFloat insetsTop = candidate.adjustedContentInset.top;
    CGFloat insetsBottom = candidate.adjustedContentInset.bottom;
    
    // Determine min/max offsets in points
    // minOffset is usually -topInset (e.g. 0 if no inset, or negative if navigation bar is translucent)
    CGFloat minOffsetPt = -insetsTop;
    CGFloat maxAvailableScrollPt = MAX(0, contentPt + insetsBottom + insetsTop - viewportPt);
    CGFloat maxOffsetPt = minOffsetPt + maxAvailableScrollPt;
    
    // 3. Convert Offset Units
    // The incoming offset is in physical pixels (as per requirement)
    CGFloat stepPt = offsetPx / scale;
    
    // 4. Calculate Target
    NSInteger clampedIndex = index;
    if (clampedIndex < 0) clampedIndex = 0;
    if (clampedIndex > maxIndex) clampedIndex = maxIndex;
    
    CGFloat targetPt;
    if (clampedIndex == 0) {
        targetPt = minOffsetPt; // Force top
    } else {
        targetPt = minOffsetPt + (clampedIndex * stepPt);
    }
    
    // Clamp target to valid bounds
    CGFloat clampedPt = MAX(minOffsetPt, MIN(maxOffsetPt, targetPt));
    
    // 5. Apply Scroll
    // Only scroll if we are not already there (within small epsilon)
    // But for index 0, always ensure we are at top
    if (SCROLL_DEBUG) {
        NSLog(@"[%@] Scrolling to index: %ld, targetPt: %.1f, clampedPt: %.1f", LOG_TAG, (long)clampedIndex, targetPt, clampedPt);
    }
    
    [candidate setContentOffset:CGPointMake(candidate.contentOffset.x, clampedPt) animated:NO];
    [candidate layoutIfNeeded];
    
    // 6. Read Back
    CGFloat actualOffsetPt = candidate.contentOffset.y;
    CGFloat actualOffsetPx = actualOffsetPt * scale; // Convert back to pixels for return value
    // Adjust actualOffsetPx relative to minOffset (scrolled distance)
    // We want to return "how many pixels we scrolled from top"
    // So if minOffsetPt is -44, and we are at -44, scrolled distance is 0.
    // If we are at 0, scrolled distance is 44pt.
    CGFloat scrolledDistancePt = actualOffsetPt - minOffsetPt;
    CGFloat scrolledDistancePx = scrolledDistancePt * scale;
    
    // 7. Detect Bottom
    CGFloat epsilonPt = 2.0 / scale; // ~2px tolerance
    BOOL reachedBottom = NO;
    
    // Reached bottom if:
    // a) Actual offset is close to max offset
    // b) There was no scroll range to begin with (maxAvailableScrollPt is small)
    if (actualOffsetPt >= maxOffsetPt - epsilonPt) {
        reachedBottom = YES;
    }
    if (maxAvailableScrollPt <= epsilonPt) {
        reachedBottom = YES;
    }
    
    // Also if we requested an index > 0 but couldn't move past previous checkpoint, 
    // it implies stuck or bottom. But strictly check bounds here.
    
    NSDictionary *scrollViewFrame = [self getScrollViewFrameInPhysicalPixels:candidate window:keyWindow];

    return @{
        @"reachedBottom": @(reachedBottom),
        @"appliedIndex": @(clampedIndex),
        @"appliedOffsetPx": @(scrolledDistancePx), // Return relative scrolled distance
        @"viewportPx": @(viewportPt * scale),
        @"contentPx": @(contentPt * scale),
        @"scrollViewFrame": scrollViewFrame,
    };
}

@end