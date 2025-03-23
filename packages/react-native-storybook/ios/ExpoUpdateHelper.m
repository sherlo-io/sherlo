#import "ExpoUpdateHelper.h"
#import <UIKit/UIKit.h>

@implementation ExpoUpdateHelper

static bool expoUpdateDeeplinkConsumed = false;

+ (void)consumeExpoUpdateDeeplink:(NSString *)expoUpdateDeeplink error:(NSError **)error {
    __block NSError *blockError = nil;
    dispatch_time_t delayTime = dispatch_time(DISPATCH_TIME_NOW, 1 * NSEC_PER_SEC);
    
    dispatch_after(delayTime, dispatch_get_main_queue(), ^{
        NSURL *nsurl = [NSURL URLWithString:expoUpdateDeeplink];

        if ([[UIApplication sharedApplication] canOpenURL:nsurl]) {
            expoUpdateDeeplinkConsumed = true;
            [[UIApplication sharedApplication] openURL:nsurl options:@{} completionHandler:nil];
        } else {
            blockError = [NSError errorWithDomain:@"ExpoUpdateHelper" code:1 userInfo:@{NSLocalizedDescriptionKey: @"ERROR_OPENING_URL"}];
        }
    });
    
    if (blockError && error) {
        *error = blockError;
    }
}

+ (BOOL)wasDeeplinkConsumed {
    return expoUpdateDeeplinkConsumed;
}

@end
