#import "StabilityHelper.h"

static NSString *const LOG_TAG = @"SherloModule:StabilityHelper";

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
 * @param resolve Promise resolver to call with true if UI becomes stable, false if timeout occurs
 * @param reject Promise rejecter to call if an error occurs
 */
+ (void)stabilize:(double)requiredMatches
        minScreenshotsCount:(double)minScreenshotsCount
        intervalMs:(double)intervalMs
        timeoutMs:(double)timeoutMs
        saveScreenshots:(BOOL)saveScreenshots
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
                
                BOOL imagesMatch = [self image:currentScreenshot isEqualToImage:lastScreenshot];
                
                if (imagesMatch) {
                    NSLog(@"[%@] Consecutive match number: %ld", LOG_TAG, (long)consecutiveMatches);
                    consecutiveMatches++;
                } else {
                    NSLog(@"[%@] No consecutive match", LOG_TAG);
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

// Helper method to save a screenshot to the filesystem
+ (void)saveScreenshot:(UIImage *)screenshot withIndex:(NSInteger)index {
    NSString *directoryPath = [self getScreenshotsDirectory];
    if (!directoryPath) {
        NSLog(@"[%@] Failed to create directory for saving screenshots", LOG_TAG);
        return;
    }
    
    NSDateFormatter *formatter = [[NSDateFormatter alloc] init];
    [formatter setDateFormat:@"yyyyMMdd_HHmmss"];
    NSString *timestamp = [formatter stringFromDate:[NSDate date]];
    
    NSString *filename = [NSString stringWithFormat:@"screenshot_%ld_%@.png", (long)index, timestamp];
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

// Helper method to compare two images by comparing their PNG representations.
+ (BOOL)image:(UIImage *)image1 isEqualToImage:(UIImage *)image2 {
    // Quick size comparison before expensive data comparison
    if (!CGSizeEqualToSize(image1.size, image2.size)) {
        return NO;
    }
    
    // For better performance, you could compare pixel data directly instead of PNG representation
    // But the PNG comparison is safer for this fix
    NSData *data1 = UIImagePNGRepresentation(image1);
    NSData *data2 = UIImagePNGRepresentation(image2);
    return [data1 isEqual:data2];
}

@end