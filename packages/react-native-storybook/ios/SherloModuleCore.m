#import "SherloModuleCore.h"
#import "FileSystemHelper.h"
#import "InspectorHelper.h"
#import "ConfigHelper.h"
#import "EasUpdateHelper.h"
#import "StabilityHelper.h"
#import "KeyboardHelper.h"
#import "LastStateHelper.h"
#import "RestartHelper.h"

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
    
    config = [ConfigHelper loadConfig:fileSystemHelper];

    if (config) {
        currentMode = [ConfigHelper determineModeFromConfig:config];
        
        NSLog(@"[%@] Initialized with mode: %@", LOG_TAG, currentMode);
        
        if ([currentMode isEqualToString:MODE_TESTING]) {
            [KeyboardHelper setupKeyboardSwizzling];

            lastState = [LastStateHelper getLastState:fileSystemHelper];

            NSString *requestId = lastState[@"requestId"];

            NSMutableDictionary *nativeLoadedProtocolItem = [NSMutableDictionary dictionary];
            [nativeLoadedProtocolItem setObject:@([[NSDate date] timeIntervalSince1970] * 1000) forKey:@"timestamp"];
            [nativeLoadedProtocolItem setObject:@"app" forKey:@"entity"];
            [nativeLoadedProtocolItem setObject:@"NATIVE_LOADED" forKey:@"action"];
            if (requestId) {
                [nativeLoadedProtocolItem setObject:requestId forKey:@"requestId"];
            }

            NSData *jsonData = [NSJSONSerialization dataWithJSONObject:nativeLoadedProtocolItem options:0 error:nil];
            NSString *nativeLoadedProtocolItemString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
            nativeLoadedProtocolItemString = [nativeLoadedProtocolItemString stringByAppendingString:@"\n"];
            [fileSystemHelper appendFile:@"protocol.sherlo" content:nativeLoadedProtocolItemString];

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
        @"lastState": lastStateString ?: [NSNull null]
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

/**
 * Detects if the currently visible screen has a vertically scrollable view suitable for long-screenshot capture.
 */
- (void)isScrollableSnapshot:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    dispatch_async(dispatch_get_main_queue(), ^{
        @try {
            BOOL result = [self detectScrollableView];
            resolve(@(result));
        } @catch (NSException *exception) {
            if (SCROLL_DEBUG) {
                NSLog(@"[%@] isScrollableSnapshot exception: %@", LOG_TAG, exception);
            }
            resolve(@(NO));
        }
    });
}

/**
 * Main detection logic for scrollable views.
 */
- (BOOL)detectScrollableView {
    // Constants
    const CGFloat EPSILON = 4.0;
    const CGFloat NUDGE_PX = 3.0;
    const CGFloat MIN_SCROLL_RANGE_RATIO = 0.20; // Minimum 20% of viewport height

    // Get key window
    UIWindow *keyWindow = [self getKeyWindow];
    if (!keyWindow) {
        if (SCROLL_DEBUG) {
            NSLog(@"[%@] isScrollableSnapshot: No key window found", LOG_TAG);
        }
        return NO;
    }

    // Try probe-based detection first
    UIScrollView *candidate = [self findScrollViewViaProbe:keyWindow];
    NSString *selectionMethod = @"probe-hitTest";

    // Fallback to largest visible scroll view
    if (!candidate) {
        candidate = [self findLargestVisibleScrollView:keyWindow];
        selectionMethod = @"fallback-largest";
    }

    if (!candidate) {
        if (SCROLL_DEBUG) {
            NSLog(@"[%@] isScrollableSnapshot: No scroll view candidate found", LOG_TAG);
        }
        return NO;
    }

    if (SCROLL_DEBUG) {
        NSLog(@"[%@] isScrollableSnapshot: Candidate found via %@, class: %@",
              LOG_TAG, selectionMethod, NSStringFromClass([candidate class]));
    }

    // Metric-based scrollability check
    if ([self isScrollableByMetrics:candidate epsilon:EPSILON minRangeRatio:MIN_SCROLL_RANGE_RATIO]) {
        if (SCROLL_DEBUG) {
            NSLog(@"[%@] isScrollableSnapshot: Metric check passed, skipping nudge validation to prevent transient scroll indicators.", LOG_TAG);
        }
        return YES;
    }

    // Fallback: Control validation: nudge and restore
    BOOL nudgeResult = [self validateWithNudge:candidate nudgePx:NUDGE_PX];
    if (SCROLL_DEBUG) {
        NSLog(@"[%@] isScrollableSnapshot: Nudge validation result: %@", LOG_TAG, nudgeResult ? @"YES" : @"NO");
    }

    return nudgeResult;
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
 * Find scroll view using coordinate probe + hitTest.
 */
- (UIScrollView *)findScrollViewViaProbe:(UIWindow *)window {
    // Probe point: 50% width, 55% height (slightly below center to avoid nav headers)
    CGPoint probePoint = CGPointMake(
        window.bounds.size.width * 0.5,
        window.bounds.size.height * 0.55
    );

    UIView *hitView = [window hitTest:probePoint withEvent:nil];
    if (!hitView) {
        // Try secondary probe at 70% height
        probePoint.y = window.bounds.size.height * 0.70;
        hitView = [window hitTest:probePoint withEvent:nil];
    }

    if (!hitView) {
        return nil;
    }

    // Walk up superview chain to find vertically scrollable UIScrollView
    UIView *current = hitView;
    while (current) {
        if ([current isKindOfClass:[UIScrollView class]]) {
            UIScrollView *sv = (UIScrollView *)current;
            // Use a very low threshold (epsilon) for candidate selection,
            // as we just want to know if it's the right "kind" of scroll view.
            if ([self isScrollableByMetrics:sv epsilon:1.0 minRangeRatio:0.01]) {
                return sv;
            }
        }
        current = current.superview;
    }

    return nil;
}

/**
 * Fallback: Find the largest visible UIScrollView in the hierarchy.
 */
- (UIScrollView *)findLargestVisibleScrollView:(UIWindow *)window {
    UIView *rootView = window.rootViewController.view;
    if (!rootView) {
        return nil;
    }

    __block UIScrollView *bestCandidate = nil;
    __block CGFloat bestArea = 0;

    [self traverseViewHierarchy:rootView block:^(UIView *view) {
        if (![view isKindOfClass:[UIScrollView class]]) {
            return;
        }

        UIScrollView *scrollView = (UIScrollView *)view;

        // Check basic visibility
        if (scrollView.hidden || scrollView.alpha < 0.01 || !scrollView.isScrollEnabled || !scrollView.window) {
            return;
        }

        // Must be vertically scrollable to be a candidate for long screenshots
        if (![self isScrollableByMetrics:scrollView epsilon:1.0 minRangeRatio:0.01]) {
            return;
        }

        // Calculate visible intersection area
        CGRect frameInWindow = [scrollView convertRect:scrollView.bounds toView:window];
        CGRect intersection = CGRectIntersection(frameInWindow, window.bounds);

        if (CGRectIsNull(intersection) || CGRectIsEmpty(intersection)) {
            return;
        }

        CGFloat area = intersection.size.width * intersection.size.height;
        if (area > bestArea) {
            bestArea = area;
            bestCandidate = scrollView;
        }
    }];

    return bestCandidate;
}

/**
 * Recursive hierarchy traversal.
 */
- (void)traverseViewHierarchy:(UIView *)view block:(void(^)(UIView *))block {
    block(view);
    for (UIView *subview in view.subviews) {
        [self traverseViewHierarchy:subview block:block];
    }
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
    // 1. Select Candidate (reuse logic)
    UIWindow *keyWindow = [self getKeyWindow];
    UIScrollView *candidate = nil;
    
    if (keyWindow) {
        candidate = [self findScrollViewViaProbe:keyWindow];
        if (!candidate) {
            candidate = [self findLargestVisibleScrollView:keyWindow];
        }
    }
    
    if (!candidate) {
        if (SCROLL_DEBUG) {
            NSLog(@"[%@] scrollToCheckpoint: No candidate found", LOG_TAG);
        }
        return @{
            @"reachedBottom": @(YES),
            @"appliedIndex": @(0),
            @"appliedOffsetPx": @(0),
            @"viewportPx": @(0),
            @"contentPx": @(0)
        };
    }
    
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
    
    return @{
        @"reachedBottom": @(reachedBottom),
        @"appliedIndex": @(clampedIndex),
        @"appliedOffsetPx": @(scrolledDistancePx), // Return relative scrolled distance
        @"viewportPx": @(viewportPt * scale),
        @"contentPx": @(contentPt * scale)
    };
}

@end 