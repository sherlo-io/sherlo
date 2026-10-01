#import "StabilityHelper.h"
#import "sherlo_core.h"
#import <QuartzCore/QuartzCore.h>

static NSString *const LOG_TAG = @"SherloModule:StabilityHelper";

// The C core's ABI this glue knows (SHERLO_CORE_ABI when it was written). The core is linked in
// from SherloCore.xcframework; one that reports another ABI is refused, and no screen is still.
static const int32_t KNOWN_CORE_ABI = 1;

// Milliseconds on a clock that only moves forward.
static int64_t nowMs(void) {
    return (int64_t)(CACurrentMediaTime() * 1000.0);
}

/**
 * One screenshot drawn once into premultiplied RGBA8, the bytes the C core compares. Each
 * screenshot is drawn once and kept until the next one has been compared with it.
 */
@interface SherloScreenshotPixels : NSObject
@property (nonatomic, readonly) NSMutableData *bytes;
@property (nonatomic, readonly) size_t width;
@property (nonatomic, readonly) size_t height;
@end

@implementation SherloScreenshotPixels

- (instancetype)initWithImage:(UIImage *)image {
    if ((self = [super init])) {
        CGImageRef cgImage = image.CGImage;
        _width = CGImageGetWidth(cgImage);
        _height = CGImageGetHeight(cgImage);
        _bytes = [NSMutableData dataWithLength:_width * _height * 4];

        CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
        CGContextRef context = CGBitmapContextCreate(_bytes.mutableBytes, _width, _height, 8, _width * 4, colorSpace,
                                                     kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);
        CGColorSpaceRelease(colorSpace);
        if (!context) {
            @throw [NSException exceptionWithName:NSInternalInconsistencyException
                                           reason:@"Failed to create bitmap context."
                                         userInfo:nil];
        }
        CGContextDrawImage(context, CGRectMake(0, 0, _width, _height), cgImage);
        CGContextRelease(context);
    }
    return self;
}

- (sherlo_image)coreImage {
    sherlo_image image;
    image.pixels = (const uint8_t *)self.bytes.bytes;
    image.width = (int32_t)self.width;
    image.height = (int32_t)self.height;
    image.stride_bytes = (int32_t)(self.width * 4);
    image.format = SHERLO_PIXELS_RGBA8_PREMULTIPLIED;
    return image;
}

@end

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
    int32_t coreAbi = sherlo_core_abi();
    if (coreAbi != KNOWN_CORE_ABI) {
        NSLog(@"[%@] UI is not stable - the C core speaks ABI %d, this SDK knows ABI %d", LOG_TAG, coreAbi, KNOWN_CORE_ABI);
        resolve(@NO);
        return;
    }

    // Ensure that UI operations are performed on the main thread.
    dispatch_async(dispatch_get_main_queue(), ^{
        UIImage *firstScreenshot = [self captureScreenshot];
        if (!firstScreenshot) {
            reject(@"SCREENSHOT_FAILED", @"Failed to capture initial screenshot", nil);
            return;
        }

        if (saveScreenshots) {
            [self saveScreenshot:firstScreenshot withIndex:0];
        }
        __block SherloScreenshotPixels *lastPixels = [[SherloScreenshotPixels alloc] initWithImage:firstScreenshot];

        // iOS's own constants: the clock starts once the first screenshot is taken, and that
        // screenshot does not count towards the minimum.
        sherlo_still_params params;
        params.required_still_pairs = (int32_t)requiredMatches;
        params.minimum_screenshots = (int32_t)minScreenshotsCount;
        params.counts_first_screenshot = 0;
        params.time_limit_ms = (int64_t)timeoutMs;
        params.threshold = threshold;
        params.include_aa = includeAA ? 1 : 0;
        sherlo_still_state *stillness = sherlo_still_begin(&params, nowMs());
        if (!stillness) {
            NSLog(@"[%@] UI is not stable - the C core could not start a stillness decision", LOG_TAG);
            resolve(@NO);
            return;
        }

        __block NSInteger screenshotCounter = 0;

        // Create a timer to check for UI stability
        [NSTimer scheduledTimerWithTimeInterval:(MAX(intervalMs, 1) / 1000.0)
                                        repeats:YES
                                          block:^(NSTimer * _Nonnull t) {
            @autoreleasepool {
                screenshotCounter++;
                // iOS reads its clock when the timer fires, before the screenshot.
                int64_t tickMs = nowMs();

                UIImage *currentScreenshot = [self captureScreenshot];
                if (!currentScreenshot) {
                    [t invalidate];
                    sherlo_still_end(stillness);
                    reject(@"SCREENSHOT_FAILED", @"Failed to capture screenshot during stability check", nil);
                    return;
                }

                if (saveScreenshots) {
                    [self saveScreenshot:currentScreenshot withIndex:screenshotCounter];
                }
                SherloScreenshotPixels *currentPixels = [[SherloScreenshotPixels alloc] initWithImage:currentScreenshot];

                sherlo_image previousImage = [lastPixels coreImage];
                sherlo_image currentImage = [currentPixels coreImage];
                int64_t differentPixels = 0;
                int32_t verdict = sherlo_still_step(stillness, &previousImage, &currentImage, tickMs, 0, &differentPixels);

                if (differentPixels == SHERLO_ERROR_SIZE_MISMATCH) {
                    // As before the C core: a screenshot of another size throws.
                    NSString *reason = [NSString stringWithFormat:
                        @"Image sizes do not match. Image1: %lux%lu, Image2: %lux%lu",
                        (unsigned long)currentPixels.width, (unsigned long)currentPixels.height,
                        (unsigned long)lastPixels.width, (unsigned long)lastPixels.height];
                    @throw [NSException exceptionWithName:NSInvalidArgumentException reason:reason userInfo:nil];
                }

                if (differentPixels == 0) {
                    NSLog(@"[%@] Consecutive match", LOG_TAG);
                } else {
                    NSLog(@"[%@] No consecutive match - %lld different pixels", LOG_TAG, (long long)differentPixels);
                }

                // The previous screenshot has been compared: only the newest is kept.
                lastPixels = currentPixels;

                if (verdict == SHERLO_STILL_CONTINUE) {
                    return;
                }
                if (verdict == SHERLO_STILL_STABLE) {
                    NSLog(@"[%@] UI is stable", LOG_TAG);
                } else if (verdict == SHERLO_STILL_UNSTABLE) {
                    NSLog(@"[%@] UI is unstable", LOG_TAG);
                } else {
                    NSLog(@"[%@] UI is not stable - the C core refused the screenshots (%d)", LOG_TAG, verdict);
                }
                [t invalidate];
                sherlo_still_end(stillness);
                resolve(verdict == SHERLO_STILL_STABLE ? @YES : @NO);
            }
        }];
    });
}

/**
 * Native paint barrier. See header for rationale.
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