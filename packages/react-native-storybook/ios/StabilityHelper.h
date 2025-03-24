#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <React/RCTBridgeModule.h>

NS_ASSUME_NONNULL_BEGIN

// Completion block type for the stability check
typedef void(^StableUICheckerCompletion)(BOOL stable);

@interface StabilityHelper : NSObject

/**
 Checks if the UI is stable by taking consecutive screenshots.

 @param requiredMatches The number of consecutive matching screenshots needed.
 @param intervalMs The interval between each screenshot in milliseconds.
 @param timeoutMs The overall timeout in milliseconds.
 @param resolve The resolver block to resolve the promise.
 @param reject The rejecter block to reject the promise.
 */
+ (void)stabilize:(NSInteger)requiredMatches
        intervalMs:(NSInteger)intervalMs
         timeoutMs:(NSInteger)timeoutMs
          resolver:(RCTPromiseResolveBlock)resolve
          rejecter:(RCTPromiseRejectBlock)reject;

@end

NS_ASSUME_NONNULL_END
