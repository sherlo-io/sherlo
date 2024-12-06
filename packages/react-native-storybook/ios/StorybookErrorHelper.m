#import "StorybookErrorHelper.h"

@implementation StorybookErrorHelper

+ (BOOL)checkIfContainsStorybookError:(UIWindow *)window {
    if (!window) {
        return NO;
    }
    return [self searchForStorybookError:window];
}

+ (BOOL)searchForStorybookError:(UIView *)view {
    // Check for RCTTextView specifically
    if ([NSStringFromClass([view class]) isEqualToString:@"RCTTextView"]) {
        NSString *text = view.accessibilityLabel;
        if (text && [text containsString:@"Something went wrong rendering your story"]) {
            return YES;
        }
    }

    // Recursively search through subviews
    for (UIView *subview in view.subviews) {
        if ([self searchForStorybookError:subview]) {
            return YES;
        }
    }
    
    return NO;
}

@end
