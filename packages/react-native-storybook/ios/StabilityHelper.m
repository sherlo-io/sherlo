#import "StabilityHelper.h"

static NSString *const LOG_TAG = @"SherloModule:StabilityHelper";

@implementation StabilityHelper

/**
 * Checks if the UI is stable by taking consecutive screenshots.
 * Resolves the promise when the required number of matching screenshots is reached,
 * or when the timeout is exceeded.
 *
 * @param requiredMatches Number of consecutive matching screenshots needed to consider UI stable
 * @param intervalMs Time interval between screenshots in milliseconds
 * @param timeoutMs Maximum time to wait for stability in milliseconds
 * @param resolve Promise resolver to call with true if UI becomes stable, false if timeout occurs
 * @param reject Promise rejecter to call if an error occurs
 */
+ (void)stabilize:(NSInteger)requiredMatches
        intervalMs:(NSInteger)intervalMs
         timeoutMs:(NSInteger)timeoutMs
          resolver:(RCTPromiseResolveBlock)resolve
          rejecter:(RCTPromiseRejectBlock)reject {
    
    // Ensure that UI operations are performed on the main thread.
    dispatch_async(dispatch_get_main_queue(), ^{
        __block UIImage *lastScreenshot = [self captureScreenshot];
        if (!lastScreenshot) {
            reject(@"SCREENSHOT_FAILED", @"Failed to capture initial screenshot", nil);
            return;
        }
        
        __block NSInteger consecutiveMatches = 0;
        NSDate *startTime = [NSDate date];
        
        [NSTimer scheduledTimerWithTimeInterval:(MAX(intervalMs, 1) / 1000.0)
                                        repeats:YES
                                          block:^(NSTimer * _Nonnull t) {
            UIImage *currentScreenshot = [self captureScreenshot];
            if (!currentScreenshot) {
                [t invalidate];
                reject(@"SCREENSHOT_FAILED", @"Failed to capture screenshot during stability check", nil);
                return;
            }
            
            NSTimeInterval elapsedSeconds = -[startTime timeIntervalSinceNow];
            NSInteger elapsedMs = (NSInteger)(elapsedSeconds * 1000);
            
            if ([self image:currentScreenshot isEqualToImage:lastScreenshot]) {
                consecutiveMatches++;
            } else {
                consecutiveMatches = 0; // Reset if the screenshots don't match.
            }
            
            // Update the last screenshot for the next iteration.
            lastScreenshot = currentScreenshot;
            
            // Check if we have achieved the required number of consecutive matches.
            if (consecutiveMatches >= requiredMatches) {
                NSLog(@"[%@] UI is stable", LOG_TAG);
                [t invalidate];
                resolve(@YES);
            }
            // Check if we've exceeded the timeout.
            else if (elapsedMs >= timeoutMs) {
                NSLog(@"[%@] UI is unstable", LOG_TAG);
                [t invalidate];
                resolve(@NO);
            }
        }];
    });
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
    NSData *data1 = UIImagePNGRepresentation(image1);
    NSData *data2 = UIImagePNGRepresentation(image2);
    return [data1 isEqual:data2];
}

@end