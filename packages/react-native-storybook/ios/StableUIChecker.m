#import "StableUIChecker.h"

@implementation StableUIChecker

- (void)checkIfStableWithRequiredMatches:(NSInteger)requiredMatches
                                intervalMs:(NSInteger)intervalMs
                                 timeoutMs:(NSInteger)timeoutMs
                                completion:(StableUICheckerCompletion)completion {
  // Ensure that UI operations are performed on the main thread.
  dispatch_async(dispatch_get_main_queue(), ^{
    __block UIImage *lastScreenshot = [self captureScreenshot];
    __block NSInteger consecutiveMatches = 0;
    NSDate *startTime = [NSDate date];
    
    [NSTimer scheduledTimerWithTimeInterval:(MAX(intervalMs, 1) / 1000.0)
                                  repeats:YES
                                    block:^(NSTimer * _Nonnull t) {
      UIImage *currentScreenshot = [self captureScreenshot];
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
        [t invalidate];
        completion(YES);
      }
      // Check if we've exceeded the timeout.
      else if (elapsedMs >= timeoutMs) {
        [t invalidate];
        completion(NO);
      }
    }];
  });
}

// Helper method to capture a screenshot of the key window.
- (UIImage *)captureScreenshot {
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
- (BOOL)image:(UIImage *)image1 isEqualToImage:(UIImage *)image2 {
  NSData *data1 = UIImagePNGRepresentation(image1);
  NSData *data2 = UIImagePNGRepresentation(image2);
  return [data1 isEqual:data2];
}

@end