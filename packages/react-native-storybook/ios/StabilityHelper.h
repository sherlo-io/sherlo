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
 * @param intervalMs Time interval between screenshots in milliseconds
 * @param timeoutMs Maximum time to wait for stability in milliseconds
 * @param resolve Promise resolver to call with true if UI becomes stable, false if timeout occurs
 * @param reject Promise rejecter to call if an error occurs
 */
+ (void)stabilize:(NSInteger)requiredMatches
        intervalMs:(NSInteger)intervalMs
         timeoutMs:(NSInteger)timeoutMs
          resolver:(RCTPromiseResolveBlock)resolve
          rejecter:(RCTPromiseRejectBlock)reject;

@end

NS_ASSUME_NONNULL_END
