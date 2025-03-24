#import "KeyboardHelper.h"
#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <objc/runtime.h>

/**
 * Helper for managing keyboard interactions in a React Native application.
 * Provides functionality to intercept and modify keyboard behavior, particularly
 * useful for testing scenarios where keyboard needs to be controlled programmatically.
 */
@implementation KeyboardHelper

/**
 * Sets up keyboard swizzling to intercept keyboard events.
 * Replaces the original methods of UITextField and UITextView with custom implementations
 * that can be controlled programmatically during testing.
 */
+ (void)setupKeyboardSwizzling {
    // Swizzle UITextField
    Method textFieldMethod = class_getInstanceMethod([UITextField class], @selector(becomeFirstResponder));
    
    IMP newTextFieldImplementation = imp_implementationWithBlock(^BOOL(id _self) {
        return NO;
    });
    method_setImplementation(textFieldMethod, newTextFieldImplementation);
    
    // Swizzle UITextView
    Method textViewModel = class_getInstanceMethod([UITextView class], @selector(becomeFirstResponder));
    
    IMP newTextViewImplementation = imp_implementationWithBlock(^BOOL(id _self) {
        return NO;
    });
    method_setImplementation(textViewModel, newTextViewImplementation);
    
    // Additional input elements that can trigger keyboard
    Class searchBarClass = NSClassFromString(@"UISearchBar");
    if (searchBarClass) {
        Method searchBarMethod = class_getInstanceMethod(searchBarClass, @selector(becomeFirstResponder));
        method_setImplementation(searchBarMethod, newTextFieldImplementation);
    }

    // WebView input fields
    Class webViewClass = NSClassFromString(@"WKWebView");
    if (webViewClass) {
        Method webViewMethod = class_getInstanceMethod(webViewClass, @selector(becomeFirstResponder));
        method_setImplementation(webViewMethod, newTextFieldImplementation);
    }

    // Custom input accessory views
    Method inputAccessoryMethod = class_getInstanceMethod([UIResponder class], @selector(inputAccessoryView));
    if (inputAccessoryMethod) {
        IMP newInputAccessoryImplementation = imp_implementationWithBlock(^UIView*(id _self) {
            return nil;
        });
        method_setImplementation(inputAccessoryMethod, newInputAccessoryImplementation);
    }

    // Prevent focus state changes
    Method canBecomeFirstResponder = class_getInstanceMethod([UIResponder class], @selector(canBecomeFirstResponder));
    IMP newCanBecomeFirstResponder = imp_implementationWithBlock(^BOOL(id _self) {
        return NO;
    });
    method_setImplementation(canBecomeFirstResponder, newCanBecomeFirstResponder);
    
    // Prevent any existing first responder from keeping its state
    Method isFirstResponder = class_getInstanceMethod([UIResponder class], @selector(isFirstResponder));
    IMP newIsFirstResponder = imp_implementationWithBlock(^BOOL(id _self) {
        return NO;
    });
    method_setImplementation(isFirstResponder, newIsFirstResponder);

    NSLog(@"[%@] Enhanced keyboard and focus state swizzling enabled", LOG_TAG);
}

@end 