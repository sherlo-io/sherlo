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

    NSString *className = NSStringFromClass([view class]);
    [viewDict setObject:className forKey:@"className"];

    BOOL isVisible = !view.hidden && view.alpha > 0.01 && view.window != nil;
    [viewDict setObject:@(isVisible) forKey:@"isVisible"];

    if (isVisible) {
        CGRect windowFrame = [view convertRect:view.bounds toView:nil];
        CGFloat screenScale = [UIScreen mainScreen].nativeScale;
        
        // Adjust the coordinates and size using the native scale
        [viewDict setObject:@(windowFrame.origin.x * screenScale) forKey:@"x"];
        [viewDict setObject:@(windowFrame.origin.y * screenScale) forKey:@"y"];
        [viewDict setObject:@(windowFrame.size.width * screenScale) forKey:@"width"];
        [viewDict setObject:@(windowFrame.size.height * screenScale) forKey:@"height"];

        if (view.accessibilityIdentifier) {
            [viewDict setObject:view.accessibilityIdentifier forKey:@"accessibilityIdentifier"];
        }

        if (view.backgroundColor) {
            CGFloat red, green, blue, alpha;
            [view.backgroundColor getRed:&red green:&green blue:&blue alpha:&alpha];
            NSString *hexColor = [NSString stringWithFormat:@"#%02lX%02lX%02lX",
                                   lroundf(red * 255),
                                   lroundf(green * 255),
                                   lroundf(blue * 255)];
            [viewDict setObject:hexColor forKey:@"backgroundColor"];
        }

        if ([view isKindOfClass:[UILabel class]]) {
            UILabel *label = (UILabel *)view;
            if (label.text) {
                [viewDict setObject:label.text forKey:@"text"];
            }
            
            // Create font dictionary
            NSMutableDictionary *fontDict = [NSMutableDictionary dictionary];
            [fontDict setObject:@(label.font.pointSize) forKey:@"size"];
            
            // Font weight
            UIFontDescriptor *descriptor = label.font.fontDescriptor;
            NSDictionary *traits = [descriptor objectForKey:UIFontDescriptorTraitsAttribute];
            CGFloat weight = [traits[UIFontWeightTrait] floatValue];
            [fontDict setObject:@(weight) forKey:@"weight"];
            
            // Font style traits
            UIFontDescriptorSymbolicTraits symbolicTraits = descriptor.symbolicTraits;
            [fontDict setObject:@((symbolicTraits & UIFontDescriptorTraitItalic) != 0) forKey:@"isItalic"];
            [fontDict setObject:@((symbolicTraits & UIFontDescriptorTraitBold) != 0) forKey:@"isBold"];
            
            // Font family and name
            [fontDict setObject:label.font.familyName forKey:@"family"];
            [fontDict setObject:label.font.fontName forKey:@"name"];
            
            // Text color
            CGFloat red, green, blue, alpha;
            [label.textColor getRed:&red green:&green blue:&blue alpha:&alpha];
            NSString *textColor = [NSString stringWithFormat:@"#%02lX%02lX%02lX",
                               lroundf(red * 255),
                               lroundf(green * 255),
                               lroundf(blue * 255)];
            [fontDict setObject:textColor forKey:@"color"];
            
            // Text alignment
            [fontDict setObject:@(label.textAlignment) forKey:@"alignment"];
            
            // Line height related
            [fontDict setObject:@(label.numberOfLines) forKey:@"numberOfLines"];
            if (@available(iOS 14.0, *)) {
                [fontDict setObject:@(label.lineBreakStrategy) forKey:@"lineBreakStrategy"];
            }
            [fontDict setObject:@(label.lineBreakMode) forKey:@"lineBreakMode"];
            
            // Letter spacing (kern)
            NSNumber *kernValue = @0;
            if (label.attributedText.length > 0) {
                kernValue = [label.attributedText attribute:NSKernAttributeName atIndex:0 effectiveRange:NULL] ?: @0;
            }
            [fontDict setObject:kernValue forKey:@"letterSpacing"];
            
            [viewDict setObject:fontDict forKey:@"font"];
        }
        else if ([view isKindOfClass:[UIButton class]]) {
            UIButton *button = (UIButton *)view;
            NSString *buttonText = [button titleForState:UIControlStateNormal];
            if (buttonText) {
                [viewDict setObject:buttonText forKey:@"text"];
            }
            
            // Create font dictionary for button
            NSMutableDictionary *fontDict = [NSMutableDictionary dictionary];
            UIFont *buttonFont = button.titleLabel.font;
            [fontDict setObject:@(buttonFont.pointSize) forKey:@"size"];
            
            // Font weight
            UIFontDescriptor *buttonDescriptor = buttonFont.fontDescriptor;
            NSDictionary *buttonTraits = [buttonDescriptor objectForKey:UIFontDescriptorTraitsAttribute];
            CGFloat buttonWeight = [buttonTraits[UIFontWeightTrait] floatValue];
            [fontDict setObject:@(buttonWeight) forKey:@"weight"];
            
            // Font style traits
            UIFontDescriptorSymbolicTraits traits = buttonFont.fontDescriptor.symbolicTraits;
            [fontDict setObject:@((traits & UIFontDescriptorTraitItalic) != 0) forKey:@"isItalic"];
            [fontDict setObject:@((traits & UIFontDescriptorTraitBold) != 0) forKey:@"isBold"];
            
            // Font family and name
            [fontDict setObject:buttonFont.familyName forKey:@"family"];
            [fontDict setObject:buttonFont.fontName forKey:@"name"];
            
            // Text color
            UIColor *textColor = [button titleColorForState:UIControlStateNormal];
            CGFloat red, green, blue, alpha;
            [textColor getRed:&red green:&green blue:&blue alpha:&alpha];
            NSString *hexColor = [NSString stringWithFormat:@"#%02lX%02lX%02lX",
                               lroundf(red * 255),
                               lroundf(green * 255),
                               lroundf(blue * 255)];
            [fontDict setObject:hexColor forKey:@"color"];
            
            // Text alignment
            [fontDict setObject:@(button.titleLabel.textAlignment) forKey:@"alignment"];
            
            [viewDict setObject:fontDict forKey:@"font"];
        }
        else if ([view isKindOfClass:[UITextField class]]) {
            UITextField *textField = (UITextField *)view;
            if (textField.text) {
                [viewDict setObject:textField.text forKey:@"text"];
            }
            
            // Create font dictionary for text field
            NSMutableDictionary *fontDict = [NSMutableDictionary dictionary];
            [fontDict setObject:@(textField.font.pointSize) forKey:@"size"];
            
            // Font weight
            UIFontDescriptor *textFieldDescriptor = textField.font.fontDescriptor;
            NSDictionary *textFieldTraits = [textFieldDescriptor objectForKey:UIFontDescriptorTraitsAttribute];
            CGFloat textFieldWeight = [textFieldTraits[UIFontWeightTrait] floatValue];
            [fontDict setObject:@(textFieldWeight) forKey:@"weight"];
            
            // Font style traits
            UIFontDescriptorSymbolicTraits traits = textField.font.fontDescriptor.symbolicTraits;
            [fontDict setObject:@((traits & UIFontDescriptorTraitItalic) != 0) forKey:@"isItalic"];
            [fontDict setObject:@((traits & UIFontDescriptorTraitBold) != 0) forKey:@"isBold"];
            
            // Font family and name
            [fontDict setObject:textField.font.familyName forKey:@"family"];
            [fontDict setObject:textField.font.fontName forKey:@"name"];
            
            // Text color
            CGFloat red, green, blue, alpha;
            [textField.textColor getRed:&red green:&green blue:&blue alpha:&alpha];
            NSString *hexColor = [NSString stringWithFormat:@"#%02lX%02lX%02lX",
                               lroundf(red * 255),
                               lroundf(green * 255),
                               lroundf(blue * 255)];
            [fontDict setObject:hexColor forKey:@"color"];
            
            // Text alignment
            [fontDict setObject:@(textField.textAlignment) forKey:@"alignment"];
            
            [viewDict setObject:fontDict forKey:@"font"];
        }
    }

    [array addObject:viewDict];

    for (UIView *subview in view.subviews) {
        [self collectViewInfo:subview intoArray:array];
    }
}

@end
