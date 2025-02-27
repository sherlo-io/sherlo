#import "InspectorHelper.h"
#import <UIKit/UIKit.h>

@implementation InspectorHelper

+ (NSString *)dumpBoundaries:(NSError **)error {
    UIWindow *keyWindow = [UIApplication sharedApplication].keyWindow;
    if (!keyWindow) {
      *error = [NSError errorWithDomain:@"InspectorHelper" code:1 userInfo:@{NSLocalizedDescriptionKey: @"Could not find the key window"}];
      return nil;
    }

    UIView *rootView = keyWindow.rootViewController.view;
    if (!rootView) {
      *error = [NSError errorWithDomain:@"InspectorHelper" code:2 userInfo:@{NSLocalizedDescriptionKey: @"Could not find the root view"}];
      return nil;
    }

    NSMutableArray *viewList = [NSMutableArray array];
    [self collectViewInfo:rootView intoArray:viewList];

    // Create the root JSON object
    NSMutableDictionary *rootObject = [NSMutableDictionary dictionary];
    CGFloat screenScale = [UIScreen mainScreen].nativeScale;
    CGRect nativeBounds = [UIScreen mainScreen].nativeBounds;
    
    // Calculate the scale factor based on the native dimensions
    CGFloat widthScale = nativeBounds.size.width / keyWindow.bounds.size.width;
    CGFloat heightScale = nativeBounds.size.height / keyWindow.bounds.size.height;
    
    // Use the system's default font size for body text
    UIFont *defaultFont = [UIFont preferredFontForTextStyle:UIFontTextStyleBody];
    CGFloat defaultFontSize = defaultFont.pointSize;
    CGFloat fontScale = defaultFontSize / [UIFont systemFontSize];
    
    [rootObject setObject:@(screenScale) forKey:@"density"];
    [rootObject setObject:@(fontScale) forKey:@"fontScale"];
    [rootObject setObject:viewList forKey:@"viewInfo"];

    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:rootObject options:0 error:error];
    if (!jsonData) {
        *error = [NSError errorWithDomain:@"InspectorHelper" code:3 userInfo:@{NSLocalizedDescriptionKey: @"Could not serialize view data to JSON"}];
        return nil;
    }

    return [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
}

+ (void)collectViewInfo:(UIView *)view intoArray:(NSMutableArray *)array {
    NSMutableDictionary *viewDict = [NSMutableDictionary dictionary];

    // Class name - should always be valid as it's a system call
    NSString *className = NSStringFromClass([view class]);
    if (className) {
        [viewDict setObject:className forKey:@"className"];
    } else {
        [viewDict setObject:@"Unknown" forKey:@"className"];
    }

    // Visibility - using primitive bool, will always be valid
    BOOL isVisible = !view.hidden && view.alpha > 0.01 && view.window != nil;
    [viewDict setObject:@(isVisible) forKey:@"isVisible"];

    if (isVisible) {
        // Frame calculations - check for infinity and NaN
        CGRect windowFrame = [view convertRect:view.bounds toView:nil];
        CGFloat screenScale = [UIScreen mainScreen].nativeScale;
        
        CGFloat x = windowFrame.origin.x * screenScale;
        CGFloat y = windowFrame.origin.y * screenScale;
        CGFloat width = windowFrame.size.width * screenScale;
        CGFloat height = windowFrame.size.height * screenScale;
        
        // Only add valid numerical values
        if (isfinite(x)) [viewDict setObject:@(x) forKey:@"x"];
        if (isfinite(y)) [viewDict setObject:@(y) forKey:@"y"];
        if (isfinite(width)) [viewDict setObject:@(width) forKey:@"width"];
        if (isfinite(height)) [viewDict setObject:@(height) forKey:@"height"];

        // Accessibility identifier - only add if non-nil and non-empty
        if (view.accessibilityIdentifier.length > 0) {
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
                        [viewDict setObject:hexColor forKey:@"backgroundColor"];
                    }
                }
            } @catch (NSException *exception) {
                // Ignore color conversion failures
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
    }

    [array addObject:viewDict];

    for (UIView *subview in view.subviews) {
        [self collectViewInfo:subview intoArray:array];
    }
}

// New helper methods to handle different view types
+ (void)addLabelInfo:(UILabel *)label toDictionary:(NSMutableDictionary *)viewDict {
    if (label.text.length > 0) {
        [viewDict setObject:label.text forKey:@"text"];
    }
    
    NSMutableDictionary *fontDict = [NSMutableDictionary dictionary];
    [self addFontInfo:label.font color:label.textColor alignment:label.textAlignment toDictionary:fontDict];
    
    // Label-specific properties
    if (label.numberOfLines >= 0) {
        [fontDict setObject:@(label.numberOfLines) forKey:@"numberOfLines"];
    }
    
    if (@available(iOS 14.0, *)) {
        [fontDict setObject:@(label.lineBreakStrategy) forKey:@"lineBreakStrategy"];
    }
    [fontDict setObject:@(label.lineBreakMode) forKey:@"lineBreakMode"];
    
    // Letter spacing
    if (label.attributedText.length > 0) {
        NSNumber *kernValue = [label.attributedText attribute:NSKernAttributeName atIndex:0 effectiveRange:NULL];
        if (kernValue) {
            [fontDict setObject:kernValue forKey:@"letterSpacing"];
        }
    }
    
    if (fontDict.count > 0) {
        [viewDict setObject:fontDict forKey:@"font"];
    }
}

+ (void)addButtonInfo:(UIButton *)button toDictionary:(NSMutableDictionary *)viewDict {
    NSString *buttonText = [button titleForState:UIControlStateNormal];
    if (buttonText.length > 0) {
        [viewDict setObject:buttonText forKey:@"text"];
    }
    
    NSMutableDictionary *fontDict = [NSMutableDictionary dictionary];
    [self addFontInfo:button.titleLabel.font 
               color:[button titleColorForState:UIControlStateNormal]
           alignment:button.titleLabel.textAlignment 
        toDictionary:fontDict];
    
    if (fontDict.count > 0) {
        [viewDict setObject:fontDict forKey:@"font"];
    }
}

+ (void)addTextFieldInfo:(UITextField *)textField toDictionary:(NSMutableDictionary *)viewDict {
    if (textField.text.length > 0) {
        [viewDict setObject:textField.text forKey:@"text"];
    }
    
    NSMutableDictionary *fontDict = [NSMutableDictionary dictionary];
    [self addFontInfo:textField.font 
               color:textField.textColor
           alignment:textField.textAlignment 
        toDictionary:fontDict];
    
    if (fontDict.count > 0) {
        [viewDict setObject:fontDict forKey:@"font"];
    }
}

+ (void)addFontInfo:(UIFont *)font color:(UIColor *)textColor alignment:(NSTextAlignment)alignment toDictionary:(NSMutableDictionary *)fontDict {
    if (!font) return;
    
    // Font size
    if (isfinite(font.pointSize)) {
        [fontDict setObject:@(font.pointSize) forKey:@"size"];
    }
    
    // Font weight
    UIFontDescriptor *descriptor = font.fontDescriptor;
    if (descriptor) {
        NSDictionary *traits = [descriptor objectForKey:UIFontDescriptorTraitsAttribute];
        if (traits) {
            NSNumber *weight = traits[UIFontWeightTrait];
            if (weight && isfinite(weight.floatValue)) {
                [fontDict setObject:weight forKey:@"weight"];
            }
        }
        
        // Font style traits
        UIFontDescriptorSymbolicTraits symbolicTraits = descriptor.symbolicTraits;
        [fontDict setObject:@((symbolicTraits & UIFontDescriptorTraitItalic) != 0) forKey:@"isItalic"];
        [fontDict setObject:@((symbolicTraits & UIFontDescriptorTraitBold) != 0) forKey:@"isBold"];
    }
    
    // Font family and name
    if (font.familyName) {
        [fontDict setObject:font.familyName forKey:@"family"];
    }
    if (font.fontName) {
        [fontDict setObject:font.fontName forKey:@"name"];
    }
    
    // Text color
    if (textColor) {
        CGFloat red = 0, green = 0, blue = 0, alpha = 0;
        @try {
            if ([textColor getRed:&red green:&green blue:&blue alpha:&alpha]) {
                if (isfinite(red) && isfinite(green) && isfinite(blue)) {
                    NSString *hexColor = [NSString stringWithFormat:@"#%02lX%02lX%02lX",
                                       lroundf(red * 255),
                                       lroundf(green * 255),
                                       lroundf(blue * 255)];
                    [fontDict setObject:hexColor forKey:@"color"];
                }
            }
        } @catch (NSException *exception) {
            // Ignore color conversion failures
        }
    }
    
    // Text alignment
    [fontDict setObject:@(alignment) forKey:@"alignment"];
}

@end
