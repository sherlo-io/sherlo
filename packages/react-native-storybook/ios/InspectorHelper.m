#import "InspectorHelper.h"
#import <UIKit/UIKit.h>

static NSString *const LOG_TAG = @"SherloModule:InspectorHelper";

/**
 * Helper for inspecting the UI view hierarchy of a React Native application.
 * Provides functionality to collect information about views and their properties.
 */
@implementation InspectorHelper

/**
 * Gets UI inspector data from the current view hierarchy.
 * Runs the data collection on the main thread and returns a serialized JSON string.
 *
 * @param resolve Promise resolver to call with the inspector data
 * @param reject Promise rejecter to call if an error occurs
 */
+ (void)getInspectorData:(RCTPromiseResolveBlock)resolve
                rejecter:(RCTPromiseRejectBlock)reject {
    dispatch_async(dispatch_get_main_queue(), ^{
        NSError *error = nil;
        NSString *jsonString = [InspectorHelper dumpBoundaries:&error];
        
        if (error) {
            reject(@"E_INSPECTOR", @"Error getting inspector data", error);
            return;
        }
        
        if (!jsonString) {
            reject(@"E_INSPECTOR", @"Failed to generate inspector data", nil);
            return;
        }
        
        resolve(jsonString);
    });
}

/**
 * Collects and serializes data about the view hierarchy.
 * Creates a JSON object with device metrics and detailed view information.
 *
 * @param error Pointer to an NSError that will be populated if an error occurs
 * @return JSON string representing the view hierarchy and device metrics
 */
+ (NSString *)dumpBoundaries:(NSError **)error {
    UIWindow *keyWindow = nil;
    NSArray *windows = [UIApplication sharedApplication].windows;
    for (UIWindow *window in windows) {
        if (window.isKeyWindow) {
            keyWindow = window;
            break;
        }
    }
    
    if (!keyWindow) {
        if (error) {
            *error = [NSError errorWithDomain:@"InspectorHelper" code:1 userInfo:@{NSLocalizedDescriptionKey: @"Could not find the key window"}];
        }
        return nil;
    }
    
    UIView *rootView = keyWindow.rootViewController.view;
    if (!rootView) {
        if (error) {
            *error = [NSError errorWithDomain:@"InspectorHelper" code:2 userInfo:@{NSLocalizedDescriptionKey: @"Could not find the root view"}];
        }
        return nil;
    }
    
    NSMutableArray *viewList = [NSMutableArray array];
    [self collectViewInfo:rootView intoArray:viewList];
    
    // Create the root JSON object
    NSMutableDictionary *rootObject = [NSMutableDictionary dictionary];
    CGFloat screenScale = [UIScreen mainScreen].nativeScale;
    
    // Use the system's default font size for body text
    UIFont *defaultFont = [UIFont preferredFontForTextStyle:UIFontTextStyleBody];
    CGFloat defaultFontSize = defaultFont ? defaultFont.pointSize : [UIFont systemFontSize];
    CGFloat fontScale = defaultFontSize / [UIFont systemFontSize];
    
    // Only add if the numbers are finite
    if (isfinite(screenScale)) {
        [rootObject setObject:@(screenScale) forKey:@"density"];
    }
    if (isfinite(fontScale)) {
        [rootObject setObject:@(fontScale) forKey:@"fontScale"];
    }
    [rootObject setObject:viewList forKey:@"viewInfo"];
    
    // Add validation before JSON serialization
    if (![NSJSONSerialization isValidJSONObject:rootObject]) {
        NSMutableDictionary *debugInfo = [NSMutableDictionary dictionary];
        
        // Add debug logging
        NSLog(@"[%@] JSON serialization failed for rootObject", LOG_TAG);
        
        // Check each main component
        if (![NSJSONSerialization isValidJSONObject:viewList]) {
            NSLog(@"[%@] Invalid viewList detected", LOG_TAG);
            [debugInfo setObject:@"Invalid viewList" forKey:@"invalidComponent"];
            // Find problematic view entry
            for (NSInteger i = 0; i < viewList.count; i++) {
                if (![NSJSONSerialization isValidJSONObject:viewList[i]]) {
                    NSDictionary *invalidView = viewList[i];
                    NSLog(@"[%@] Found invalid view at index %ld", LOG_TAG, (long)i);
                    NSLog(@"[%@] Invalid view class: %@", LOG_TAG, [invalidView[@"className"] description]);
                    
                    [debugInfo setObject:[NSString stringWithFormat:@"View at index %ld", (long)i] forKey:@"invalidIndex"];
                    [debugInfo setObject:[invalidView[@"className"] description] forKey:@"viewClass"];
                    
                    // Try to identify which property is invalid
                    for (NSString *key in invalidView) {
                        id value = invalidView[key];
                        if (![self isValidJSONValue:value]) {
                            NSString *debugValue = [NSString stringWithFormat:@"%@: %@", key, [value description]];
                            NSLog(@"[%@] Invalid property found: %@", LOG_TAG, debugValue);
                            [debugInfo setObject:debugValue forKey:@"invalidProperty"];
                            break;
                        }
                    }
                    break;
                }
            }
        }
        
        if (error) {
            *error = [NSError errorWithDomain:@"InspectorHelper" 
                                       code:3 
                                   userInfo:@{
                NSLocalizedDescriptionKey: @"Could not serialize view data to JSON",
                @"debugInfo": debugInfo
            }];
            // Add debug logging for the error
            NSLog(@"[%@] Created error with debug info: %@", LOG_TAG, debugInfo);
        }
        return nil;
    }
    
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:rootObject options:0 error:error];
    if (!jsonData) {
        if (error) {
            *error = [NSError errorWithDomain:@"InspectorHelper" code:3 userInfo:@{NSLocalizedDescriptionKey: @"Could not serialize view data to JSON"}];
        }
        return nil;
    }
    
    return [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
}

/**
 * Validates if a value can be serialized as JSON.
 *
 * @param value The value to check
 * @return YES if the value is valid for JSON serialization, NO otherwise
 */
+ (BOOL)isValidJSONValue:(id)value {
    if (!value) return YES;
    
    if ([value isKindOfClass:[NSString class]] ||
        [value isKindOfClass:[NSNumber class]] ||
        [value isKindOfClass:[NSNull class]]) {
        return YES;
    }
    
    if ([value isKindOfClass:[NSArray class]]) {
        return [NSJSONSerialization isValidJSONObject:value];
    }
    
    if ([value isKindOfClass:[NSDictionary class]]) {
        return [NSJSONSerialization isValidJSONObject:value];
    }
    
    return NO;
}

/**
 * Recursively collects information about a view and its children.
 * Extracts properties like position, size, visibility, text content, and styling.
 *
 * @param view The view to collect information from
 * @param array The array to add view information objects to
 */
+ (void)collectViewInfo:(UIView *)view intoArray:(NSMutableArray *)array {
    NSMutableDictionary *viewDict = [NSMutableDictionary dictionary];
    
    // Class name - always valid
    NSString *className = NSStringFromClass([view class]);
    if (className && className.length > 0) {
        [viewDict setObject:className forKey:@"className"];
    } else {
        [viewDict setObject:@"Unknown" forKey:@"className"];
    }
    
    // Visibility
    BOOL isVisible = !view.hidden && view.alpha > 0.01 && view.window != nil;
    [viewDict setObject:@(isVisible) forKey:@"isVisible"];
    
    if (isVisible) {
        // Frame calculations
        CGRect windowFrame = [view convertRect:view.bounds toView:nil];
        CGFloat screenScale = [UIScreen mainScreen].nativeScale;
        
        CGFloat x = windowFrame.origin.x * screenScale;
        CGFloat y = windowFrame.origin.y * screenScale;
        CGFloat width = windowFrame.size.width * screenScale;
        CGFloat height = windowFrame.size.height * screenScale;
        
        if (isfinite(x)) {
            [viewDict setObject:@(x) forKey:@"x"];
        }
        if (isfinite(y)) {
            [viewDict setObject:@(y) forKey:@"y"];
        }
        if (isfinite(width)) {
            [viewDict setObject:@(width) forKey:@"width"];
        }
        if (isfinite(height)) {
            [viewDict setObject:@(height) forKey:@"height"];
        }
        
        // Accessibility identifier
        if (view.accessibilityIdentifier && view.accessibilityIdentifier.length > 0) {
            [viewDict setObject:view.accessibilityIdentifier forKey:@"accessibilityIdentifier"];
        }
        
        // Background color
        if (view.backgroundColor) {
            CGFloat red = 0, green = 0, blue = 0, alpha = 0;
            @try {
                if ([view.backgroundColor getRed:&red green:&green blue:&blue alpha:&alpha]) {
                    if (isfinite(red) && isfinite(green) && isfinite(blue)) {
                        NSString *hexColor = [NSString stringWithFormat:@"#%02lX%02lX%02lX",
                                              lroundf(red * 255),
                                              lroundf(green * 255),
                                              lroundf(blue * 255)];
                        if (hexColor && hexColor.length > 0) {
                            [viewDict setObject:hexColor forKey:@"backgroundColor"];
                        }
                    }
                }
            } @catch (NSException *exception) {
                // Ignore conversion failures
            }
        }
        
        // Handle text-based views
        if ([view isKindOfClass:[UILabel class]]) {
            UILabel *label = (UILabel *)view;
            [self addLabelInfo:label toDictionary:viewDict];
        }
        else if ([view isKindOfClass:[UIButton class]]) {
            UIButton *button = (UIButton *)view;
            [self addButtonInfo:button toDictionary:viewDict];
        }
        else if ([view isKindOfClass:[UITextField class]]) {
            UITextField *textField = (UITextField *)view;
            [self addTextFieldInfo:textField toDictionary:viewDict];
        }
        // Add RCTTextView handling
        else if ([className isEqualToString:@"RCTTextView"]) {
            NSString *text = view.accessibilityLabel;
            if (text && text.length > 0) {
                [viewDict setObject:text forKey:@"text"];
            }
        }
    }
    
    [array addObject:viewDict];
    
    for (UIView *subview in view.subviews) {
        [self collectViewInfo:subview intoArray:array];
    }
}

/**
 * Adds label-specific information to a view dictionary.
 *
 * @param label The UILabel to extract information from
 * @param dict The dictionary to add the information to
 */
+ (void)addLabelInfo:(UILabel *)label toDictionary:(NSMutableDictionary *)dict {
    if (label.text && label.text.length > 0) {
        [dict setObject:label.text forKey:@"text"];
    }
    
    NSMutableDictionary *fontDict = [NSMutableDictionary dictionary];
    [fontDict setObject:@(label.font.pointSize) forKey:@"size"];
    [fontDict setObject:[NSString stringWithFormat:@"#%08lX", (unsigned long)label.textColor.CGColor] forKey:@"color"];
    
    UIFont *font = label.font;
    [fontDict setObject:@(font.fontDescriptor.symbolicTraits & UIFontDescriptorTraitBold ? YES : NO) forKey:@"isBold"];
    [fontDict setObject:@(font.fontDescriptor.symbolicTraits & UIFontDescriptorTraitItalic ? YES : NO) forKey:@"isItalic"];
    
    // Add text alignment
    [fontDict setObject:@(label.textAlignment) forKey:@"alignment"];
    
    [dict setObject:fontDict forKey:@"font"];
}

/**
 * Adds button-specific information to a view dictionary.
 *
 * @param button The UIButton to extract information from
 * @param dict The dictionary to add the information to
 */
+ (void)addButtonInfo:(UIButton *)button toDictionary:(NSMutableDictionary *)dict {
    NSString *title = [button titleForState:UIControlStateNormal];
    if (title && title.length > 0) {
        [dict setObject:title forKey:@"text"];
    }
    
    UIColor *titleColor = [button titleColorForState:UIControlStateNormal];
    UIFont *titleFont = button.titleLabel.font;
    
    if (titleColor && titleFont) {
        NSMutableDictionary *fontDict = [NSMutableDictionary dictionary];
        [fontDict setObject:@(titleFont.pointSize) forKey:@"size"];
        [fontDict setObject:[NSString stringWithFormat:@"#%08lX", (unsigned long)titleColor.CGColor] forKey:@"color"];
        
        [fontDict setObject:@(titleFont.fontDescriptor.symbolicTraits & UIFontDescriptorTraitBold ? YES : NO) forKey:@"isBold"];
        [fontDict setObject:@(titleFont.fontDescriptor.symbolicTraits & UIFontDescriptorTraitItalic ? YES : NO) forKey:@"isItalic"];
        
        [dict setObject:fontDict forKey:@"font"];
    }
    
    [dict setObject:@(button.state) forKey:@"state"];
    [dict setObject:@(button.enabled) forKey:@"enabled"];
}

/**
 * Adds text field-specific information to a view dictionary.
 *
 * @param textField The UITextField to extract information from
 * @param dict The dictionary to add the information to
 */
+ (void)addTextFieldInfo:(UITextField *)textField toDictionary:(NSMutableDictionary *)dict {
    NSString *text = textField.text;
    if (text && text.length > 0) {
        [dict setObject:text forKey:@"text"];
    }
    
    if (textField.placeholder && textField.placeholder.length > 0) {
        [dict setObject:textField.placeholder forKey:@"placeholder"];
    }
    
    NSMutableDictionary *fontDict = [NSMutableDictionary dictionary];
    [fontDict setObject:@(textField.font.pointSize) forKey:@"size"];
    [fontDict setObject:[NSString stringWithFormat:@"#%08lX", (unsigned long)textField.textColor.CGColor] forKey:@"color"];
    
    UIFont *font = textField.font;
    [fontDict setObject:@(font.fontDescriptor.symbolicTraits & UIFontDescriptorTraitBold ? YES : NO) forKey:@"isBold"];
    [fontDict setObject:@(font.fontDescriptor.symbolicTraits & UIFontDescriptorTraitItalic ? YES : NO) forKey:@"isItalic"];
    
    // Add text alignment
    [fontDict setObject:@(textField.textAlignment) forKey:@"alignment"];
    
    [dict setObject:fontDict forKey:@"font"];
    [dict setObject:@(textField.secureTextEntry) forKey:@"isSecure"];
    [dict setObject:@(textField.enabled) forKey:@"enabled"];
}

@end
