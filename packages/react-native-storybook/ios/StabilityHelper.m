#import "StabilityHelper.h"
#import "Pixelmatch.h"
#import <QuartzCore/QuartzCore.h>

static NSString *const LOG_TAG = @"SherloModule:StabilityHelper";

/**
 * One-shot CADisplayLink target for the native paint barrier. CADisplayLink
 * requires an Obj-C target + selector (it cannot take a block directly), so this
 * tiny class adapts the frame callback into a block.
 */
@interface SherloPaintBarrierTarget : NSObject
@property (nonatomic, copy) void (^onFrame)(void);
@end

@implementation SherloPaintBarrierTarget
- (void)handleFrame:(CADisplayLink *)link {
    if (self.onFrame) {
        self.onFrame();
    }
}
@end

@implementation StabilityHelper

/**
 * Checks if the UI is stable by taking consecutive screenshots.
 * Resolves the promise when the required number of matching screenshots is reached,
 * or when the timeout is exceeded.
 *
 * @param requiredMatches Number of consecutive matching screenshots needed to consider UI stable
 * @param minScreenshotsCount Minimum number of screenshots to take when checking for stability
 * @param intervalMs Time interval between screenshots in milliseconds
 * @param timeoutMs Maximum time to wait for stability in milliseconds
 * @param saveScreenshots Whether to save screenshots to filesystem during tests
 * @param threshold Matching threshold (0.0 to 1.0); smaller values are more sensitive
 * @param includeAA If false, ignore anti-aliased pixels when counting differences
 * @param resolve Promise resolver to call with true if UI becomes stable, false if timeout occurs
 * @param reject Promise rejecter to call if an error occurs
 */
+ (void)stabilize:(double)requiredMatches
        minScreenshotsCount:(double)minScreenshotsCount
        intervalMs:(double)intervalMs
        timeoutMs:(double)timeoutMs
        saveScreenshots:(BOOL)saveScreenshots
        threshold:(double)threshold
        includeAA:(BOOL)includeAA
        resolve:(RCTPromiseResolveBlock)resolve
        reject:(RCTPromiseRejectBlock)reject {
    
    // Ensure that UI operations are performed on the main thread.
    dispatch_async(dispatch_get_main_queue(), ^{
        __block UIImage *lastScreenshot = [self captureScreenshot];
        if (!lastScreenshot) {
            reject(@"SCREENSHOT_FAILED", @"Failed to capture initial screenshot", nil);
            return;
        }
        
        if (saveScreenshots) {
            [self saveScreenshot:lastScreenshot withIndex:0];
        }
        
        __block NSInteger consecutiveMatches = 0;
        __block NSInteger screenshotCounter = 0;
        NSDate *startTime = [NSDate date];
        
        // Create a timer to check for UI stability
        NSTimer *timer = [NSTimer scheduledTimerWithTimeInterval:(MAX(intervalMs, 1) / 1000.0)
                                        repeats:YES
                                          block:^(NSTimer * _Nonnull t) {
            @autoreleasepool {
                screenshotCounter++;
                
                NSTimeInterval elapsedSeconds = -[startTime timeIntervalSinceNow];
                NSInteger elapsedMs = (NSInteger)(elapsedSeconds * 1000);
                
                UIImage *currentScreenshot = [self captureScreenshot];
                if (!currentScreenshot) {
                    [t invalidate];
                    reject(@"SCREENSHOT_FAILED", @"Failed to capture screenshot during stability check", nil);
                    return;
                }
                
                if (saveScreenshots) {
                    [self saveScreenshot:currentScreenshot withIndex:screenshotCounter];
                }
                
                NSUInteger differentPixels = [Pixelmatch pixelmatchImage:currentScreenshot 
                                                           againstImage:lastScreenshot 
                                                              threshold:threshold 
                                                               includeAA:includeAA];
                
                BOOL imagesMatch = (differentPixels == 0);
                
                if (imagesMatch) {
                    NSLog(@"[%@] Consecutive match number: %ld", LOG_TAG, (long)consecutiveMatches);
                    consecutiveMatches++;
                } else {
                    NSLog(@"[%@] No consecutive match - %lu different pixels", LOG_TAG, (unsigned long)differentPixels);
                    consecutiveMatches = 0; // Reset if the screenshots don't match.
                }
                
                // Release previous screenshot to free memory
                UIImage *tempImage = lastScreenshot;
                lastScreenshot = currentScreenshot;
                tempImage = nil;
                
                // Check if we have achieved the required number of consecutive matches.
                if (consecutiveMatches >= requiredMatches) {
                    NSLog(@"[%@] UI is stable", LOG_TAG);
                    [t invalidate];
                    resolve(@YES);
                }
                // Check if we've exceeded the timeout for matching but have taken minimum screenshots
                else if (elapsedMs >= timeoutMs && consecutiveMatches == 0 && screenshotCounter >= minScreenshotsCount) {
                    NSLog(@"[%@] UI is unstable", LOG_TAG);
                    [t invalidate];
                    resolve(@NO);
                }
            }
        }];
    });
}

/**
 * Native paint barrier (SHERLO-1497). See header for rationale.
 * Forces a layout + redraw of the key window, then resolves on the next display
 * frame via a one-shot CADisplayLink. Best-effort: resolves @NO on timeout.
 */
+ (void)awaitFrameCommit:(double)timeoutMs
                 resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject {
    dispatch_async(dispatch_get_main_queue(), ^{
        UIWindow *window = [self barrierKeyWindow];
        if (!window) {
            resolve(@NO);
            return;
        }

        // Force the next frame to be produced.
        [window setNeedsLayout];
        [window layoutIfNeeded];
        [window.layer setNeedsDisplay];

        __block BOOL settled = NO;
        __block CADisplayLink *link = nil;
        SherloPaintBarrierTarget *target = [SherloPaintBarrierTarget new];

        void (^finish)(BOOL) = ^(BOOL painted) {
            if (settled) {
                return;
            }
            settled = YES;
            [link invalidate];
            link = nil;
            resolve(painted ? @YES : @NO);
        };

        // Resolve on the first display frame after the forced redraw.
        target.onFrame = ^{
            finish(YES);
        };
        link = [CADisplayLink displayLinkWithTarget:target selector:@selector(handleFrame:)];
        [link addToRunLoop:[NSRunLoop mainRunLoop] forMode:NSRunLoopCommonModes];

        // Timeout: warn + proceed (best-effort catch-up).
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(MAX(timeoutMs, 1) * NSEC_PER_MSEC)),
                       dispatch_get_main_queue(), ^{
            if (!settled) {
                NSLog(@"[%@] awaitFrameCommit timed out after %.0fms; proceeding best-effort", LOG_TAG, timeoutMs);
                finish(NO);
            }
        });
    });
}

// Resolves the foreground key window (same scene logic as captureScreenshot).
+ (UIWindow *)barrierKeyWindow {
    UIWindow *window = nil;
    if (@available(iOS 13.0, *)) {
        NSSet<UIScene *> *scenes = UIApplication.sharedApplication.connectedScenes;
        UIScene *scene = scenes.allObjects.firstObject;
        if ([scene isKindOfClass:[UIWindowScene class]]) {
            UIWindowScene *windowScene = (UIWindowScene *)scene;
            window = windowScene.windows.firstObject;
        }
    }
    return window;
}

// Helper method to save a screenshot to the filesystem
+ (void)saveScreenshot:(UIImage *)screenshot withIndex:(NSInteger)index {
    NSString *directoryPath = [self getScreenshotsDirectory];
    if (!directoryPath) {
        NSLog(@"[%@] Failed to create directory for saving screenshots", LOG_TAG);
        return;
    }
    
    NSDateFormatter *formatter = [[NSDateFormatter alloc] init];
    [formatter setDateFormat:@"yyyyMMdd_HHmmss_SSS"];
    NSString *timestamp = [formatter stringFromDate:[NSDate date]];
    
    NSString *filename = [NSString stringWithFormat:@"%@_screenshot_%ld.png", timestamp, (long)index];
    NSString *filePath = [directoryPath stringByAppendingPathComponent:filename];
    
    NSData *imageData = UIImagePNGRepresentation(screenshot);
    BOOL success = [imageData writeToFile:filePath atomically:YES];
    
    if (success) {
        NSLog(@"[%@] Saved screenshot to: %@", LOG_TAG, filePath);
    } else {
        NSLog(@"[%@] Failed to save screenshot", LOG_TAG);
    }
}

// Helper method to get or create the screenshots directory
+ (NSString *)getScreenshotsDirectory {
    NSFileManager *fileManager = [NSFileManager defaultManager];
    NSArray *paths = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
    NSString *documentsDirectory = [paths firstObject];
    NSString *sherloDirectory = [documentsDirectory stringByAppendingPathComponent:@"sherlo"];
    NSString *screenshotsDirectory = [sherloDirectory stringByAppendingPathComponent:@"stabilization_screenshots"];
    
    // Create directories if they don't exist
    NSError *error = nil;
    if (![fileManager fileExistsAtPath:sherloDirectory]) {
        [fileManager createDirectoryAtPath:sherloDirectory
                withIntermediateDirectories:YES
                                 attributes:nil
                                      error:&error];
        if (error) {
            NSLog(@"[%@] Failed to create sherlo directory: %@", LOG_TAG, error.localizedDescription);
            return nil;
        }
    }
    
    if (![fileManager fileExistsAtPath:screenshotsDirectory]) {
        [fileManager createDirectoryAtPath:screenshotsDirectory
                withIntermediateDirectories:YES
                                 attributes:nil
                                      error:&error];
        if (error) {
            NSLog(@"[%@] Failed to create screenshots directory: %@", LOG_TAG, error.localizedDescription);
            return nil;
        }
    }
    
    return screenshotsDirectory;
}

// Helper method to capture a screenshot of the key window.
+ (UIImage *)captureScreenshot {
    UIWindow *window = nil;
    if (@available(iOS 13.0, *)) {
        NSSet<UIScene *> *scenes = UIApplication.sharedApplication.connectedScenes;
        UIScene *scene = scenes.allObjects.firstObject;
        if ([scene isKindOfClass:[UIWindowScene class]]) {
            UIWindowScene *windowScene = (UIWindowScene *)scene;
            window = windowScene.windows.firstObject;
        }
    }
    
    if (!window) {
        return nil;
    }
    
    UIGraphicsBeginImageContextWithOptions(window.bounds.size, NO, [UIScreen mainScreen].scale);
    [window drawViewHierarchyInRect:window.bounds afterScreenUpdates:NO];
    UIImage *image = UIGraphicsGetImageFromCurrentImageContext();
    UIGraphicsEndImageContext();
    return image;
}



@end