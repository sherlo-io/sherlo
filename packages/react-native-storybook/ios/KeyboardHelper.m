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
    NSLog(@"[KeyboardHelper] Setting up keyboard swizzling");
    
    // Swizzle UITextField methods
    [self swizzleUITextFieldMethods];
    
    // Swizzle UITextView methods
    [self swizzleUITextViewMethods];
}

/**
 * Swizzles methods of UITextField to intercept keyboard interactions.
 * Replaces the original implementation of becomeFirstResponder to prevent
 * keyboard from appearing during automated testing.
 */
+ (void)swizzleUITextFieldMethods {
    Class class = [UITextField class];
    
    // Swizzle becomeFirstResponder
    SEL originalSelector = @selector(becomeFirstResponder);
    SEL swizzledSelector = @selector(swizzled_becomeFirstResponder);
    
    Method originalMethod = class_getInstanceMethod(class, originalSelector);
    Method swizzledMethod = class_getInstanceMethod(class, swizzledSelector);
    
    if (originalMethod && swizzledMethod) {
        BOOL didAddMethod = class_addMethod(class,
                                         originalSelector,
                                         method_getImplementation(swizzledMethod),
                                         method_getTypeEncoding(swizzledMethod));
        
        if (didAddMethod) {
            class_replaceMethod(class,
                             swizzledSelector,
                             method_getImplementation(originalMethod),
                             method_getTypeEncoding(originalMethod));
        } else {
            method_exchangeImplementations(originalMethod, swizzledMethod);
        }
        
        NSLog(@"[KeyboardHelper] Successfully swizzled UITextField's becomeFirstResponder");
    } else {
        NSLog(@"[KeyboardHelper] Failed to swizzle UITextField's becomeFirstResponder");
    }
}

/**
 * Swizzles methods of UITextView to intercept keyboard interactions.
 * Replaces the original implementation of becomeFirstResponder to prevent
 * keyboard from appearing during automated testing.
 */
+ (void)swizzleUITextViewMethods {
    Class class = [UITextView class];
    
    // Swizzle becomeFirstResponder
    SEL originalSelector = @selector(becomeFirstResponder);
    SEL swizzledSelector = @selector(swizzled_becomeFirstResponder);
    
    Method originalMethod = class_getInstanceMethod(class, originalSelector);
    Method swizzledMethod = class_getInstanceMethod(class, swizzledSelector);
    
    if (originalMethod && swizzledMethod) {
        BOOL didAddMethod = class_addMethod(class,
                                         originalSelector,
                                         method_getImplementation(swizzledMethod),
                                         method_getTypeEncoding(swizzledMethod));
        
        if (didAddMethod) {
            class_replaceMethod(class,
                             swizzledSelector,
                             method_getImplementation(originalMethod),
                             method_getTypeEncoding(originalMethod));
        } else {
            method_exchangeImplementations(originalMethod, swizzledMethod);
        }
        
        NSLog(@"[KeyboardHelper] Successfully swizzled UITextView's becomeFirstResponder");
    } else {
        NSLog(@"[KeyboardHelper] Failed to swizzle UITextView's becomeFirstResponder");
    }
}

@end

/**
 * Category that extends UITextField with swizzled methods.
 * Used to replace the original becomeFirstResponder implementation.
 */
@implementation UITextField (Swizzled)

/**
 * Swizzled version of becomeFirstResponder that prevents keyboard from appearing.
 * Called instead of the original method when keyboard swizzling is active.
 *
 * @return YES to indicate success
 */
- (BOOL)swizzled_becomeFirstResponder {
    // Always return YES to simulate successful focus without showing keyboard
    return YES;
}

@end

/**
 * Category that extends UITextView with swizzled methods.
 * Used to replace the original becomeFirstResponder implementation.
 */
@implementation UITextView (Swizzled)

/**
 * Swizzled version of becomeFirstResponder that prevents keyboard from appearing.
 * Called instead of the original method when keyboard swizzling is active.
 *
 * @return YES to indicate success
 */
- (BOOL)swizzled_becomeFirstResponder {
    // Always return YES to simulate successful focus without showing keyboard
    return YES;
}

@end 