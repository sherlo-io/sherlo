#import "ExpoUpdateHelper.h"
#import <UIKit/UIKit.h>

@implementation ExpoUpdateHelper

static int expoUpdateDeeplinkConsumeCount = 0;

// we will open the url twice to make sure the app is restarted with new update 
// bundle and second time to make sure we dismiss the initial expo dev client modal
+ (void)consumeExpoUpdateDeeplink:(NSString *)expoUpdateDeeplink modeRef:(NSString **)modeRef error:(NSError **)error {
    if (expoUpdateDeeplinkConsumeCount < 2) {
        dispatch_async(dispatch_get_main_queue(), ^{
            NSURL *nsurl = [NSURL URLWithString:expoUpdateDeeplink];

            if ([[UIApplication sharedApplication] canOpenURL:nsurl]) {
                [[UIApplication sharedApplication] openURL:nsurl options:@{} completionHandler:nil];
                expoUpdateDeeplinkConsumeCount++;
            } else {
                *error = [NSError errorWithDomain:@"ExpoUpdateHelper" code:1 userInfo:@{NSLocalizedDescriptionKey: @"ERROR_OPENING_URL"}];
            }
        });
    } else {
        // After the URL has been consumed twice, we are in testing mode
        *modeRef = @"testing";
    }
}

@end
