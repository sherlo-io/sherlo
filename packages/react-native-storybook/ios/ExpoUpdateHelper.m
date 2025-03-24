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
 * @param expoUpdateDeeplink The Expo update deeplink URL to consume
 * @param error On input, a pointer to an error object. If an error occurs, this pointer is set to an actual error object
 * @return YES if the deeplink was successfully consumed, NO otherwise
 */
+ (BOOL)consumeExpoUpdateDeeplink:(NSString *)expoUpdateDeeplink
                          error:(NSError **)error {
    if (!expoUpdateDeeplink || expoUpdateDeeplink.length == 0) {
        NSLog(@"[ExpoUpdateHelper] Invalid or empty deeplink provided");
        if (error) {
            *error = [NSError errorWithDomain:@"ExpoUpdateHelper" code:1 userInfo:@{
                NSLocalizedDescriptionKey: @"Invalid or empty deeplink provided"
            }];
        }
        return NO;
    }
    
    NSLog(@"[ExpoUpdateHelper] Consuming update deeplink: %@", expoUpdateDeeplink);
    
    // Create URL from the deeplink string
    NSURL *deeplinkURL = [NSURL URLWithString:expoUpdateDeeplink];
    
    if (!deeplinkURL) {
        NSLog(@"[ExpoUpdateHelper] Failed to create URL from deeplink: %@", expoUpdateDeeplink);
        if (error) {
            *error = [NSError errorWithDomain:@"ExpoUpdateHelper" code:2 userInfo:@{
                NSLocalizedDescriptionKey: @"Failed to create URL from deeplink"
            }];
        }
        return NO;
    }
    
    // Open the URL to trigger the Expo update
    // This is a bit hacky but it's the simplest way to trigger an update programmatically
    dispatch_async(dispatch_get_main_queue(), ^{
        [[UIApplication sharedApplication] openURL:deeplinkURL options:@{} completionHandler:nil];
    });
    
    expoUpdateDeeplinkConsumed = true;
    return YES;
}

+ (BOOL)wasDeeplinkConsumed {
    return expoUpdateDeeplinkConsumed;
}

@end
