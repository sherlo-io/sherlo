#import "ExpoUpdateHelper.h"
#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

static NSString *const LOG_TAG = @"SherloModule:ExpoUpdateHelper";
static NSString *const DEEPLINK_CONSUMED_KEY = @"ExpoUpdateDeeplinkConsumed";

/**
 * Helper for handling Expo updates in the Sherlo module.
 * Provides functionality to process and navigate to specific Expo updates
 * when used with the Expo Update system.
 */
@implementation ExpoUpdateHelper

/**
 * Checks if any deeplink has been consumed by retrieving from NSUserDefaults.
 *
 * @return YES if any deeplink has been consumed, NO otherwise
 */
+ (BOOL)isDeeplinkConsumed {
    NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
    return [defaults boolForKey:DEEPLINK_CONSUMED_KEY];
}

/**
 * Marks a deeplink as consumed by storing a boolean flag in NSUserDefaults.
 */
+ (void)markDeeplinkAsConsumed {
    NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
    [defaults setBool:YES forKey:DEEPLINK_CONSUMED_KEY];
    [defaults synchronize];
}

/**
 * Checks if an Expo update deeplink needs to be consumed and handles it if needed.
 * Uses persistent storage to track if any deeplink has been consumed.
 *
 * @param expoUpdateDeeplink The Expo update deeplink URL to potentially consume
 */
+ (void)consumeExpoUpdateDeeplinkIfNeeded:(NSString *)expoUpdateDeeplink {
    if (!expoUpdateDeeplink || expoUpdateDeeplink.length == 0) {
        return;
    }
    
    BOOL isDeeplinkAlreadyConsumed = [self isDeeplinkConsumed];
    
    if (!isDeeplinkAlreadyConsumed) {
        NSLog(@"[%@] Consuming expo update deeplink", LOG_TAG);
        
        NSURL *deeplinkURL = [NSURL URLWithString:expoUpdateDeeplink];
        
        if (!deeplinkURL) {
            NSLog(@"[%@] Failed to create URL from deeplink: %@", LOG_TAG, expoUpdateDeeplink);
            return;
        }
        
        [self markDeeplinkAsConsumed];
        
        dispatch_async(dispatch_get_main_queue(), ^{
            [[UIApplication sharedApplication] openURL:deeplinkURL options:@{} completionHandler:nil];
        });
    }
}

@end
