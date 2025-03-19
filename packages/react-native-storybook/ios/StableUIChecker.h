#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

// Completion block type for the stability check
typedef void(^StableUICheckerCompletion)(BOOL stable);

@interface StableUIChecker : NSObject

/**
 Checks if the UI is stable by taking consecutive screenshots.

 @param requiredMatches The number of consecutive matching screenshots needed.
 @param intervalMs The interval between each screenshot in milliseconds.
 @param timeoutMs The overall timeout in milliseconds.
 @param completion Called with YES if stable (matching screenshots are found), NO if timed out.
 */
- (void)checkIfStableWithRequiredMatches:(NSInteger)requiredMatches
                                intervalMs:(NSInteger)intervalMs
                                 timeoutMs:(NSInteger)timeoutMs
                                completion:(StableUICheckerCompletion)completion;

@end

NS_ASSUME_NONNULL_END
