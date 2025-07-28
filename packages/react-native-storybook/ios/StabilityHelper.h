#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <React/RCTBridgeModule.h>

NS_ASSUME_NONNULL_BEGIN

@interface StabilityHelper : NSObject

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
          reject:(RCTPromiseRejectBlock)reject;

@end

NS_ASSUME_NONNULL_END
