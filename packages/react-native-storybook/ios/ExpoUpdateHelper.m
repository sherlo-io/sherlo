#import "ExpoUpdateHelper.h"
#import <UIKit/UIKit.h>

/**
 * Helper for handling Expo updates in the Sherlo module.
 * Provides functionality to process and navigate to specific Expo updates
 * when used with the Expo Update system.
 */
@implementation ExpoUpdateHelper

static bool expoUpdateDeeplinkConsumed = false;

/**
 * Consumes an Expo update deeplink by opening it in the application.
 * Uses the built-in URL handling mechanism to navigate to the specific update.
 *
 * @param deeplink The Expo update deeplink URL to consume
 * @return YES if the deeplink was successfully consumed, NO otherwise
 */
+ (BOOL)consumeUpdateDeeplink:(NSString *)deeplink {
    if (!deeplink || deeplink.length == 0) {
        NSLog(@"[ExpoUpdateHelper] Invalid or empty deeplink provided");
        return NO;
    }
    
    NSLog(@"[ExpoUpdateHelper] Consuming update deeplink: %@", deeplink);
    
    // Create URL from the deeplink string
    NSURL *deeplinkURL = [NSURL URLWithString:deeplink];
    
    if (!deeplinkURL) {
        NSLog(@"[ExpoUpdateHelper] Failed to create URL from deeplink: %@", deeplink);
        return NO;
    }
    
    // Open the URL to trigger the Expo update
    // This is a bit hacky but it's the simplest way to trigger an update programmatically
    dispatch_async(dispatch_get_main_queue(), ^{
        [[UIApplication sharedApplication] openURL:deeplinkURL options:@{} completionHandler:nil];
    });
    
    return YES;
}

+ (BOOL)wasDeeplinkConsumed {
    return expoUpdateDeeplinkConsumed;
}

@end
