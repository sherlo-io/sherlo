#import "VerificationHelper.h"
#import "FileSystemHelper.h"
#import <UIKit/UIKit.h>


@implementation VerificationHelper

+ (void)verifyIntegrationWithMode:(NSString *)mode
                 syncDirectoryPath:(NSString *)syncDirectoryPath
                           error:(NSError **)error {
    UIWindow *keyWindow = [UIApplication sharedApplication].keyWindow;
    if (!keyWindow) {
        *error = [NSError errorWithDomain:@"VerificationHelper" code:1 userInfo:@{NSLocalizedDescriptionKey: @"VERIFICATION_FAILED_NO_KEY_WINDOW"}];
        return;
    }

    UIView *rootView = keyWindow.rootViewController.view;
    if (!rootView) {
        *error = [NSError errorWithDomain:@"VerificationHelper" code:1 userInfo:@{NSLocalizedDescriptionKey: @"VERIFICATION_FAILED_NO_ROOT_VIEW"}];
        return;
    }

    NSMutableArray *verificationIds = [NSMutableArray array];
    [self findVerificationIds:rootView intoArray:verificationIds];

    if ([mode isEqualToString:@"testing"]) {
        if ([verificationIds count] == 0) {
            *error = [NSError errorWithDomain:@"VerificationHelper" code:1 userInfo:@{NSLocalizedDescriptionKey: @"VERIFICATION_FAILED_NO_VERIFICATION_VIEW"}];
        } else {
            NSLog(@"[VerificationHelper] Verification passed, writing to integration_verified.sherlo");
            
            // Write integration_verified.sherlo file to sync directory
            NSString *integrationVerifiedFilePath = [syncDirectoryPath stringByAppendingPathComponent:@"integration_verified.sherlo"];
            NSData *content = [@"{\"integrationVerified\": true}" dataUsingEncoding:NSUTF8StringEncoding];
            NSString *base64Content = [content base64EncodedStringWithOptions:0];
            [FileSystemHelper appendFile:integrationVerifiedFilePath contents:base64Content];
        }
    }

    if ([mode isEqualToString:@"verification"]) {
        if ([verificationIds count] == 0) {
            NSLog(@"[VerificationHelper] Verification failed, no verification view found");
            
            // Display error modal with error message
            UIAlertController *alert = [UIAlertController alertControllerWithTitle:@"Verification failed" message:@"Could not find Sherlo verification view" preferredStyle:UIAlertControllerStyleAlert];
            [alert addAction:[UIAlertAction actionWithTitle:@"OK" style:UIAlertActionStyleDefault handler:nil]];
            [[UIApplication sharedApplication].keyWindow.rootViewController presentViewController:alert animated:YES completion:nil];
        }
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
