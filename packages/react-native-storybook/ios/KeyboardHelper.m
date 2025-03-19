#import "KeyboardHelper.h"
#import <UIKit/UIKit.h>
#import <objc/runtime.h>

static NSString *const LOG_TAG = @"KeyboardHelper";

@implementation KeyboardHelper

/**
 * Sets up keyboard prevention by swizzling (replacing) input-related methods.
 * 
 * What this does:
 * - Prevents keyboard from appearing for any input elements
 * - Prevents focus on text fields, text views, search bars, and webview inputs
 * - Removes keyboard accessory views
 * 
 * What this doesn't affect:
 * - Visual appearance of UI elements (colors, sizes, borders, etc.)
 * - Touch handling (elements can still be tapped)
 * - Any other UI behavior not related to keyboard/focus
 * 
 * This is used in testing mode to ensure keyboard doesn't interfere with UI testing.
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