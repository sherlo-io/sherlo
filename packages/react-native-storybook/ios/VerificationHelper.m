#import "VerificationHelper.h"
#import "FileSystemHelper.h"
#import <UIKit/UIKit.h>


@implementation VerificationHelper

+ (void)verifyIntegrationWithMode:(NSString *)mode
                 syncDirectoryPath:(NSString *)syncDirectoryPath {
    UIWindow *keyWindow = [UIApplication sharedApplication].keyWindow;
    if (!keyWindow) {
        NSLog(@"[VerificationHelper] Could not find key window");
        return;
    }

    UIView *rootView = keyWindow.rootViewController.view;
    if (!rootView) {
        NSLog(@"[VerificationHelper] Could not find root view");
        return;
    }

    NSMutableArray *verificationIds = [NSMutableArray array];
    [self findVerificationIds:rootView intoArray:verificationIds];
    if ([verificationIds count] == 0) {
        NSLog(@"[VerificationHelper] Verification failed, no verification view found");
        
        // Display error modal with error message
        UIAlertController *alert = [UIAlertController alertControllerWithTitle:@"Verification failed" message:@"Could not find Sherlo verification view" preferredStyle:UIAlertControllerStyleAlert];
        [alert addAction:[UIAlertAction actionWithTitle:@"OK" style:UIAlertActionStyleDefault handler:nil]];
        [[UIApplication sharedApplication].keyWindow.rootViewController presentViewController:alert animated:YES completion:nil];
    }
}

+ (void)findVerificationIds:(UIView *)view intoArray:(NSMutableArray *)array {
    NSString *accessibilityIdentifier = view.accessibilityIdentifier;

    if (accessibilityIdentifier) {
        NSLog(@"[VerificationHelper] View accessibility identifier: %@", accessibilityIdentifier);

        if ([accessibilityIdentifier containsString:@"sherlo-getStorybook-verification"]) {
            [array addObject:accessibilityIdentifier];
        }
    }

    for (UIView *subview in view.subviews) {
        [self findVerificationIds:subview intoArray:array];
    }
}

@end
