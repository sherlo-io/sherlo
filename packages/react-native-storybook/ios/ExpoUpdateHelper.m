#import "ExpoUpdateHelper.h"
#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

static NSString *const LOG_TAG = @"SherloModule:ExpoUpdateHelper";

/**
 * Helper for handling Expo updates in the Sherlo module.
 * Provides functionality to process and navigate to specific Expo updates
 * when used with the Expo Update system.
 */
@implementation ExpoUpdateHelper

static bool expoUpdateDeeplinkConsumed = false;

/**
 * Checks if an Expo update deeplink needs to be consumed and handles it if needed.
 * Uses the lastState to determine if the deeplink should be consumed.
 *
 * @param expoUpdateDeeplink The Expo update deeplink URL to potentially consume
 * @param lastState The last state containing request ID information
 * @param logTag The tag to use for logging
 */
+ (void)consumeExpoUpdateDeeplinkIfNeeded:(NSString *)expoUpdateDeeplink
                               lastState:(NSDictionary *)lastState
                                 logTag:(NSString *)logTag {
    // Return early if there's no deeplink to consume
    if (!expoUpdateDeeplink || expoUpdateDeeplink.length == 0) {
        return;
    }
    
    // If last state is present we don't need to consume the deeplink
    // because expo dev client already points to the correct expo update
    BOOL lastStateHasRequestId = lastState[@"requestId"] != nil;
    
    // Only consume the deeplink if it hasn't been consumed yet and there's no request ID in the last state
    if (!expoUpdateDeeplinkConsumed && !lastStateHasRequestId) {
        NSLog(@"[%@] Consuming expo update deeplink", logTag);
        
        // Create URL from the deeplink string
        NSURL *deeplinkURL = [NSURL URLWithString:expoUpdateDeeplink];
        
        if (!deeplinkURL) {
            NSLog(@"[%@] Failed to create URL from deeplink: %@", logTag, expoUpdateDeeplink);
            return;
        }
        
        dispatch_async(dispatch_get_main_queue(), ^{
            [[UIApplication sharedApplication] openURL:deeplinkURL options:@{} completionHandler:nil];
        });
        
        // Mark as consumed
        expoUpdateDeeplinkConsumed = true;
    }
}

@end
