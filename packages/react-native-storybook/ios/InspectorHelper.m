#import "InspectorHelper.h"
#import <UIKit/UIKit.h>
#import <objc/runtime.h>

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
    
    // Modern approach using UIWindowScene.windows (iOS 13+)
    NSSet<UIScene *> *connectedScenes = [UIApplication sharedApplication].connectedScenes;
    for (UIScene *scene in connectedScenes) {
        if (scene.activationState == UISceneActivationStateForegroundActive && [scene isKindOfClass:[UIWindowScene class]]) {
            UIWindowScene *windowScene = (UIWindowScene *)scene;
            for (UIWindow *window in windowScene.windows) {
                if (window.isKeyWindow) {
                    keyWindow = window;
                    break;
                }
            }
            if (keyWindow) break;
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
    
    // Instead of a flat array, get hierarchical view structure
    NSDictionary *viewHierarchy = [self collectViewHierarchy:rootView];
    
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
    
    [rootObject setObject:viewHierarchy forKey:@"viewHierarchy"];
    
    // Add validation before JSON serialization
    if (![NSJSONSerialization isValidJSONObject:rootObject]) {
        NSMutableDictionary *debugInfo = [NSMutableDictionary dictionary];
        
        // Add debug logging
        NSLog(@"[%@] JSON serialization failed for rootObject", LOG_TAG);
        
        // Check if the hierarchy is valid
        if (![NSJSONSerialization isValidJSONObject:viewHierarchy]) {
            NSLog(@"[%@] Invalid viewHierarchy detected", LOG_TAG);
            [debugInfo setObject:@"Invalid viewHierarchy" forKey:@"invalidComponent"];
            
            // Try to identify the problem
            [self validateJsonObject:viewHierarchy withDebugInfo:debugInfo path:@"root"];
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
 * Validates a JSON object recursively to find invalid parts
 *
 * @param object The object to validate
 * @param debugInfo Dictionary to collect debug information
 * @param path Current path in the object hierarchy
 */
+ (void)validateJsonObject:(id)object withDebugInfo:(NSMutableDictionary *)debugInfo path:(NSString *)path {
    if ([object isKindOfClass:[NSDictionary class]]) {
        NSDictionary *dict = (NSDictionary *)object;
        for (NSString *key in dict) {
            id value = dict[key];
            NSString *newPath = [NSString stringWithFormat:@"%@.%@", path, key];
            
            if (![self isValidJSONValue:value]) {
                NSString *debugValue = [NSString stringWithFormat:@"%@: %@", newPath, [value description]];
                NSLog(@"[%@] Invalid property found: %@", LOG_TAG, debugValue);
                [debugInfo setObject:debugValue forKey:@"invalidProperty"];
                return;
            }
            
            if ([value isKindOfClass:[NSDictionary class]] || [value isKindOfClass:[NSArray class]]) {
                [self validateJsonObject:value withDebugInfo:debugInfo path:newPath];
            }
        }
    } else if ([object isKindOfClass:[NSArray class]]) {
        NSArray *array = (NSArray *)object;
        for (NSInteger i = 0; i < array.count; i++) {
            id value = array[i];
            NSString *newPath = [NSString stringWithFormat:@"%@[%ld]", path, (long)i];
            
            if (![self isValidJSONValue:value]) {
                NSString *debugValue = [NSString stringWithFormat:@"%@: %@", newPath, [value description]];
                NSLog(@"[%@] Invalid array item found: %@", LOG_TAG, debugValue);
                [debugInfo setObject:debugValue forKey:@"invalidProperty"];
                return;
            }
            
            if ([value isKindOfClass:[NSDictionary class]] || [value isKindOfClass:[NSArray class]]) {
                [self validateJsonObject:value withDebugInfo:debugInfo path:newPath];
            }
        }
    }
}

/**
 * Attempts to extract font information from any view that might contain text.
 * This is a more generic approach that helps with React Native components.
 *
 * @param view The view to extract font information from
 * @return A dictionary with font information if available, or nil
 */
+ (NSMutableDictionary *)extractFontInfoFromView:(UIView *)view {
    NSMutableDictionary *fontDict = [NSMutableDictionary dictionary];
    UIFont *font = nil;
    UIColor *textColor = nil;
    
    // Try different ways to get font information
    if ([view respondsToSelector:@selector(font)]) {
        font = [(id)view font];
    } else {
        // Safely try to get font via KVC
        @try {
            id fontValue = [view valueForKey:@"font"];
            if (fontValue && [fontValue isKindOfClass:[UIFont class]]) {
                font = (UIFont *)fontValue;
            }
        } @catch (NSException *exception) {
            // Font property doesn't exist, ignore
        }
    }
    
    // Try different ways to get text color information
    if ([view respondsToSelector:@selector(textColor)]) {
        textColor = [(id)view textColor];
    } else {
        // Safely try to get textColor via KVC
        @try {
            id colorValue = [view valueForKey:@"textColor"];
            if (colorValue && [colorValue isKindOfClass:[UIColor class]]) {
                textColor = (UIColor *)colorValue;
            }
        } @catch (NSException *exception) {
            // TextColor property doesn't exist, ignore
        }
    }
    
    // If we couldn't find font or color, check for a label in subviews
    if (!font || !textColor) {
        for (UIView *subview in view.subviews) {
            if ([subview isKindOfClass:[UILabel class]]) {
                UILabel *label = (UILabel *)subview;
                font = font ?: label.font;
                textColor = textColor ?: label.textColor;
                break;
            }
        }
    }
    
    // If we found a font, extract its information
    if (font) {
        [fontDict setObject:@(font.pointSize) forKey:@"size"];
        
        NSString *fontName = font.fontName;
        NSString *familyName = font.familyName;
        
        if (fontName) {
            [fontDict setObject:fontName forKey:@"name"];
        }
        
        if (familyName) {
            [fontDict setObject:familyName forKey:@"family"];
        }
        
        // Add combined style string
        [fontDict setObject:[self fontTraitsToStyleString:font.fontDescriptor.symbolicTraits] forKey:@"style"];
        
        // Add estimated line height
        CGFloat estimatedLineHeight = font.lineHeight;
        [fontDict setObject:@(estimatedLineHeight) forKey:@"lineHeight"];
    }
    
    // If we found a text color, add it
    if (textColor) {
        [fontDict setObject:[NSString stringWithFormat:@"#%08lX", (unsigned long)textColor.CGColor] forKey:@"color"];
    }
    
    return fontDict.count > 0 ? fontDict : nil;
}

/**
 * Collect information about a view and its children in a hierarchical structure.
 *
 * @param view The view to collect information from
 * @return A dictionary representing the view and its children
 */
+ (NSDictionary *)collectViewHierarchy:(UIView *)view {
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
        // Improve handling for React Native text components
        else if ([className isEqualToString:@"RCTTextView"] || 
                 [className isEqualToString:@"RCTText"] ||
                 [className isEqualToString:@"RCTVirtualText"] ||
                 ([className hasPrefix:@"RCT"] && [className hasSuffix:@"Text"])) {
            
            // Get text from accessibility label or other sources
            NSString *text = view.accessibilityLabel;
            if (text && text.length > 0) {
                [viewDict setObject:text forKey:@"text"];
            }
            
            // Create a font dictionary even if we can't get all properties
            NSMutableDictionary *fontDict = [NSMutableDictionary dictionary];
            BOOL fontInfoFound = NO;
            
            // Try different approaches to get font information

            // 1. Try using our helper method first
            NSMutableDictionary *extractedFont = [self extractFontInfoFromView:view];
            if (extractedFont && extractedFont.count > 0) {
                [viewDict setObject:extractedFont forKey:@"font"];
                fontInfoFound = YES;
            }
            
            // 2. Try to access internal properties using runtime introspection
            if (!fontInfoFound) {
                NSLog(@"[%@] Attempting to access internal properties for %@", LOG_TAG, className);
                
                // Check for textAttributes property
                @try {
                    id textAttributes = [view valueForKey:@"textAttributes"];
                    if (textAttributes && [textAttributes isKindOfClass:[NSDictionary class]]) {
                        NSDictionary *attributes = (NSDictionary *)textAttributes;
                        
                        // Extract font information from attributes
                        id fontAttribute = attributes[@"NSFont"] ?: attributes[@"UIFont"] ?: attributes[@"CTFont"];
                        if (fontAttribute && [fontAttribute isKindOfClass:[UIFont class]]) {
                            UIFont *font = (UIFont *)fontAttribute;
                            [fontDict setObject:@(font.pointSize) forKey:@"size"];
                            [fontDict setObject:font.fontName forKey:@"name"];
                            [fontDict setObject:font.familyName forKey:@"family"];
                            [fontDict setObject:[self fontTraitsToStyleString:font.fontDescriptor.symbolicTraits] forKey:@"style"];
                            fontInfoFound = YES;
                        }
                        
                        // Extract color information
                        id colorAttribute = attributes[@"NSColor"] ?: attributes[@"UIColor"] ?: attributes[@"CTForegroundColor"];
                        if (colorAttribute && [colorAttribute isKindOfClass:[UIColor class]]) {
                            UIColor *color = (UIColor *)colorAttribute;
                            [fontDict setObject:[NSString stringWithFormat:@"#%08lX", (unsigned long)color.CGColor] forKey:@"color"];
                            fontInfoFound = YES;
                        }
                    }
                } @catch (NSException *exception) {
                    NSLog(@"[%@] Failed to access textAttributes: %@", LOG_TAG, exception);
                }
            }
            
            // 3. Check subviews for UILabel or similar text views that may contain font info
            if (!fontInfoFound) {
                for (UIView *subview in view.subviews) {
                    if ([subview isKindOfClass:[UILabel class]] || 
                        [NSStringFromClass([subview class]) hasPrefix:@"RCT"]) {
                        NSMutableDictionary *subviewFont = [self extractFontInfoFromView:subview];
                        if (subviewFont && subviewFont.count > 0) {
                            [fontDict addEntriesFromDictionary:subviewFont];
                            fontInfoFound = YES;
                            break;
                        }
                    }
                }
            }
            
            // 4. Use Objective-C runtime to look for any properties that might contain font info
            if (!fontInfoFound) {
                unsigned int propertyCount;
                objc_property_t *properties = class_copyPropertyList([view class], &propertyCount);
                
                NSMutableArray *propertyNames = [NSMutableArray array];
                for (unsigned int i = 0; i < propertyCount; i++) {
                    const char *propertyName = property_getName(properties[i]);
                    NSString *name = [NSString stringWithUTF8String:propertyName];
                    [propertyNames addObject:name];
                    
                    // Check for properties that might contain font information
                    if ([name containsString:@"font"] || [name containsString:@"Font"] || 
                        [name containsString:@"text"] || [name containsString:@"Text"]) {
                        @try {
                            id value = [view valueForKey:name];
                            if (value) {
                                if ([value isKindOfClass:[UIFont class]]) {
                                    UIFont *font = (UIFont *)value;
                                    [fontDict setObject:@(font.pointSize) forKey:@"size"];
                                    [fontDict setObject:font.fontName forKey:@"name"];
                                    [fontDict setObject:font.familyName forKey:@"family"];
                                    fontInfoFound = YES;
                                } else if ([value isKindOfClass:[UIColor class]]) {
                                    UIColor *color = (UIColor *)value;
                                    [fontDict setObject:[NSString stringWithFormat:@"#%08lX", (unsigned long)color.CGColor] forKey:@"color"];
                                    fontInfoFound = YES;
                                } else if ([value isKindOfClass:[NSNumber class]] && 
                                           ([name containsString:@"size"] || [name containsString:@"Size"])) {
                                    [fontDict setObject:value forKey:@"size"];
                                    fontInfoFound = YES;
                                }
                            }
                        } @catch (NSException *exception) {
                            // Ignore exceptions when accessing properties
                        }
                    }
                }
                free(properties);
                
                NSLog(@"[%@] Found properties for %@: %@", LOG_TAG, className, propertyNames);
            }
            
            // 5. If all else fails, add some default font information
            if (!fontInfoFound) {
                // Provide reasonable defaults for font properties
                [fontDict setObject:@(14.0) forKey:@"size"]; // Default size
                
                // Try to get text color from text or background
                UIColor *estimatedColor = [UIColor whiteColor]; // Default to white
                
                if (view.backgroundColor) {
                    // Set contrast color based on background
                    CGFloat red = 0, green = 0, blue = 0, alpha = 0;
                    if ([view.backgroundColor getRed:&red green:&green blue:&blue alpha:&alpha]) {
                        // Calculate luminance - if dark background, use white text, otherwise black
                        CGFloat luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
                        estimatedColor = (luminance > 0.5) ? [UIColor blackColor] : [UIColor whiteColor];
                    }
                }
                
                [fontDict setObject:[NSString stringWithFormat:@"#%08lX", (unsigned long)estimatedColor.CGColor] forKey:@"color"];
                [fontDict setObject:@"System Font" forKey:@"family"];
                [fontDict setObject:@"Normal" forKey:@"style"];
            }
            
            // Only add font dict if we have any properties
            if (fontDict.count > 0) {
                [viewDict setObject:fontDict forKey:@"font"];
            }
        }
        // For any other view that might contain text
        else if ([view respondsToSelector:@selector(text)] || 
                 [view respondsToSelector:@selector(attributedText)]) {
            // This view has text methods but isn't one of our known text views
            NSString *text = nil;
            
            if ([view respondsToSelector:@selector(text)]) {
                text = [(id)view text];
            }
            
            if (text && text.length > 0) {
                [viewDict setObject:text forKey:@"text"];
            }
            
            // Try to extract font information
            NSMutableDictionary *fontDict = [self extractFontInfoFromView:view];
            if (fontDict) {
                [viewDict setObject:fontDict forKey:@"font"];
            }
        }
        // Add a separate safe check for 'text' property via KVC
        else {
            // Try safely checking for text property via KVC
            NSString *text = nil;
            @try {
                id textValue = [view valueForKey:@"text"];
                if (textValue && [textValue isKindOfClass:[NSString class]]) {
                    text = (NSString *)textValue;
                }
            } @catch (NSException *exception) {
                // Text property doesn't exist, ignore
            }
            
            if (text && text.length > 0) {
                [viewDict setObject:text forKey:@"text"];
                
                // If we found text but it's not a standard text view,
                // try to extract font information
                NSMutableDictionary *fontDict = [self extractFontInfoFromView:view];
                if (fontDict) {
                    [viewDict setObject:fontDict forKey:@"font"];
                }
            }
        }
    }
    
    // Add children array
    NSMutableArray *children = [NSMutableArray array];
    for (UIView *subview in view.subviews) {
        NSDictionary *childInfo = [self collectViewHierarchy:subview];
        [children addObject:childInfo];
    }
    [viewDict setObject:children forKey:@"children"];
    
    return viewDict;
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
 * Converts a NSTextAlignment value to a human-readable string.
 *
 * @param alignment The NSTextAlignment value
 * @return A human-readable string representation
 */
+ (NSString *)textAlignmentToString:(NSTextAlignment)alignment {
    switch (alignment) {
        case NSTextAlignmentLeft:
            return @"Left";
        case NSTextAlignmentCenter:
            return @"Center";
        case NSTextAlignmentRight:
            return @"Right";
        case NSTextAlignmentJustified:
            return @"Justified";
        case NSTextAlignmentNatural:
            return @"Natural";
        default:
            return [NSString stringWithFormat:@"Unknown (%ld)", (long)alignment];
    }
}

/**
 * Converts font descriptor traits to a style string.
 *
 * @param traits The UIFontDescriptorSymbolicTraits
 * @return A human-readable style string
 */
+ (NSString *)fontTraitsToStyleString:(UIFontDescriptorSymbolicTraits)traits {
    BOOL isBold = (traits & UIFontDescriptorTraitBold) != 0;
    BOOL isItalic = (traits & UIFontDescriptorTraitItalic) != 0;
    
    if (isBold && isItalic) {
        return @"Bold Italic";
    } else if (isBold) {
        return @"Bold";
    } else if (isItalic) {
        return @"Italic";
    } else {
        return @"Normal";
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
    
    // Add font family/name information
    UIFont *font = label.font;
    NSString *fontName = font.fontName;
    NSString *familyName = font.familyName;
    
    if (fontName) {
        [fontDict setObject:fontName forKey:@"name"];
    }
    
    if (familyName) {
        [fontDict setObject:familyName forKey:@"family"];
    }
    
    // Add combined style string
    [fontDict setObject:[self fontTraitsToStyleString:font.fontDescriptor.symbolicTraits] forKey:@"style"];
    
    // Convert numeric alignment to string
    [fontDict setObject:[self textAlignmentToString:label.textAlignment] forKey:@"alignment"];
    
    // Add line break mode/truncation information
    NSString *lineBreakMode;
    switch (label.lineBreakMode) {
        case NSLineBreakByWordWrapping:
            lineBreakMode = @"Word Wrapping";
            break;
        case NSLineBreakByCharWrapping:
            lineBreakMode = @"Character Wrapping";
            break;
        case NSLineBreakByClipping:
            lineBreakMode = @"Clipping";
            break;
        case NSLineBreakByTruncatingHead:
            lineBreakMode = @"Truncating Head";
            break;
        case NSLineBreakByTruncatingTail:
            lineBreakMode = @"Truncating Tail";
            break;
        case NSLineBreakByTruncatingMiddle:
            lineBreakMode = @"Truncating Middle";
            break;
        default:
            lineBreakMode = [NSString stringWithFormat:@"Unknown (%ld)", (long)label.lineBreakMode];
            break;
    }
    [fontDict setObject:lineBreakMode forKey:@"lineBreakMode"];
    
    // Add number of lines
    [fontDict setObject:@(label.numberOfLines) forKey:@"numberOfLines"];
    
    // Add line height information if available
    if ([label respondsToSelector:@selector(lineHeight)]) {
        // Some custom UILabel subclasses may implement this
        CGFloat lineHeight = [(NSNumber *)[label performSelector:@selector(lineHeight)] floatValue];
        [fontDict setObject:@(lineHeight) forKey:@"lineHeight"];
    } else {
        // For standard UILabel, we can estimate line height from the font
        CGFloat estimatedLineHeight = font.lineHeight;
        [fontDict setObject:@(estimatedLineHeight) forKey:@"lineHeight"];
    }
    
    // Add text decoration information (if available from attributedText)
    if (label.attributedText) {
        NSAttributedString *attributedText = label.attributedText;
        NSDictionary *attributes = [attributedText attributesAtIndex:0 effectiveRange:NULL];
        
        // Check for underline
        NSNumber *underlineStyle = attributes[NSUnderlineStyleAttributeName];
        if (underlineStyle && [underlineStyle intValue] != NSUnderlineStyleNone) {
            [fontDict setObject:@YES forKey:@"underline"];
        }
        
        // Check for strikethrough
        NSNumber *strikethroughStyle = attributes[NSStrikethroughStyleAttributeName];
        if (strikethroughStyle && [strikethroughStyle intValue] != NSUnderlineStyleNone) {
            [fontDict setObject:@YES forKey:@"strikethrough"];
        }
        
        // Check for kerning (letter spacing)
        NSNumber *kerning = attributes[NSKernAttributeName];
        if (kerning) {
            [fontDict setObject:kerning forKey:@"letterSpacing"];
        }
    }
    
    // Add text direction information
        NSWritingDirection writingDirection = NSWritingDirectionLeftToRight;
        if ([label.attributedText length] > 0) {
            NSDictionary *attributes = [label.attributedText attributesAtIndex:0 effectiveRange:NULL];
            NSNumber *directionNum = attributes[NSWritingDirectionAttributeName];
            if (directionNum) {
                writingDirection = (NSWritingDirection)[directionNum integerValue];
            }
        }
        
        NSString *textDirection;
        switch (writingDirection) {
            case NSWritingDirectionLeftToRight:
                textDirection = @"LTR";
                break;
            case NSWritingDirectionRightToLeft:
                textDirection = @"RTL";
                break;
            default:
                textDirection = @"Natural";
                break;
        }
        [fontDict setObject:textDirection forKey:@"textDirection"];
    }
    
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
        
        // Add font family/name information
        NSString *fontName = titleFont.fontName;
        NSString *familyName = titleFont.familyName;
        
        if (fontName) {
            [fontDict setObject:fontName forKey:@"name"];
        }
        
        if (familyName) {
            [fontDict setObject:familyName forKey:@"family"];
        }
        
        // Add combined style string
        [fontDict setObject:[self fontTraitsToStyleString:titleFont.fontDescriptor.symbolicTraits] forKey:@"style"];
        
        // Add alignment if available
        if (button.titleLabel) {
            [fontDict setObject:[self textAlignmentToString:button.titleLabel.textAlignment] forKey:@"alignment"];
            
            // Add line break mode/truncation information
            NSString *lineBreakMode;
            switch (button.titleLabel.lineBreakMode) {
                case NSLineBreakByWordWrapping:
                    lineBreakMode = @"Word Wrapping";
                    break;
                case NSLineBreakByCharWrapping:
                    lineBreakMode = @"Character Wrapping";
                    break;
                case NSLineBreakByClipping:
                    lineBreakMode = @"Clipping";
                    break;
                case NSLineBreakByTruncatingHead:
                    lineBreakMode = @"Truncating Head";
                    break;
                case NSLineBreakByTruncatingTail:
                    lineBreakMode = @"Truncating Tail";
                    break;
                case NSLineBreakByTruncatingMiddle:
                    lineBreakMode = @"Truncating Middle";
                    break;
                default:
                    lineBreakMode = [NSString stringWithFormat:@"Unknown (%ld)", (long)button.titleLabel.lineBreakMode];
                    break;
            }
            [fontDict setObject:lineBreakMode forKey:@"lineBreakMode"];
            
            // Add number of lines
            [fontDict setObject:@(button.titleLabel.numberOfLines) forKey:@"numberOfLines"];
            
            // Add estimated line height
            CGFloat estimatedLineHeight = titleFont.lineHeight;
            [fontDict setObject:@(estimatedLineHeight) forKey:@"lineHeight"];
            
            // Add text decoration information (if available from attributedText)
            NSAttributedString *attributedTitle = [button attributedTitleForState:UIControlStateNormal];
            if (attributedTitle) {
                NSDictionary *attributes = [attributedTitle attributesAtIndex:0 effectiveRange:NULL];
                
                // Check for underline
                NSNumber *underlineStyle = attributes[NSUnderlineStyleAttributeName];
                if (underlineStyle && [underlineStyle intValue] != NSUnderlineStyleNone) {
                    [fontDict setObject:@YES forKey:@"underline"];
                }
                
                // Check for strikethrough
                NSNumber *strikethroughStyle = attributes[NSStrikethroughStyleAttributeName];
                if (strikethroughStyle && [strikethroughStyle intValue] != NSUnderlineStyleNone) {
                    [fontDict setObject:@YES forKey:@"strikethrough"];
                }
                
                // Check for kerning (letter spacing)
                NSNumber *kerning = attributes[NSKernAttributeName];
                if (kerning) {
                    [fontDict setObject:kerning forKey:@"letterSpacing"];
                }
            }
        }
        
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
    
    // Add font family/name information
    UIFont *font = textField.font;
    NSString *fontName = font.fontName;
    NSString *familyName = font.familyName;
    
    if (fontName) {
        [fontDict setObject:fontName forKey:@"name"];
    }
    
    if (familyName) {
        [fontDict setObject:familyName forKey:@"family"];
    }
    
    // Add combined style string
    [fontDict setObject:[self fontTraitsToStyleString:font.fontDescriptor.symbolicTraits] forKey:@"style"];
    
    // Convert numeric alignment to string
    [fontDict setObject:[self textAlignmentToString:textField.textAlignment] forKey:@"alignment"];
    
    // Add estimated line height
    CGFloat estimatedLineHeight = font.lineHeight;
    [fontDict setObject:@(estimatedLineHeight) forKey:@"lineHeight"];
    
    // Add text decoration information (if available from attributedText)
    if (textField.attributedText) {
        NSAttributedString *attributedText = textField.attributedText;
        NSDictionary *attributes = [attributedText attributesAtIndex:0 effectiveRange:NULL];
        
        // Check for underline
        NSNumber *underlineStyle = attributes[NSUnderlineStyleAttributeName];
        if (underlineStyle && [underlineStyle intValue] != NSUnderlineStyleNone) {
            [fontDict setObject:@YES forKey:@"underline"];
        }
        
        // Check for strikethrough
        NSNumber *strikethroughStyle = attributes[NSStrikethroughStyleAttributeName];
        if (strikethroughStyle && [strikethroughStyle intValue] != NSUnderlineStyleNone) {
            [fontDict setObject:@YES forKey:@"strikethrough"];
        }
        
        // Check for kerning (letter spacing)
        NSNumber *kerning = attributes[NSKernAttributeName];
        if (kerning) {
            [fontDict setObject:kerning forKey:@"letterSpacing"];
        }
    }
    
    // Add text direction information
    if (@available(iOS 9.0, *)) {
        NSWritingDirection writingDirection = NSWritingDirectionLeftToRight;
        if ([textField.attributedText length] > 0) {
            NSDictionary *attributes = [textField.attributedText attributesAtIndex:0 effectiveRange:NULL];
            NSNumber *directionNum = attributes[NSWritingDirectionAttributeName];
            if (directionNum) {
                writingDirection = (NSWritingDirection)[directionNum integerValue];
            }
        }
        
        NSString *textDirection;
        switch (writingDirection) {
            case NSWritingDirectionLeftToRight:
                textDirection = @"LTR";
                break;
            case NSWritingDirectionRightToLeft:
                textDirection = @"RTL";
                break;
            default:
                textDirection = @"Natural";
                break;
        }
        [fontDict setObject:textDirection forKey:@"textDirection"];
    }
    
    // Add auto-correction and auto-capitalization info
    [fontDict setObject:@(textField.autocorrectionType) forKey:@"autocorrectionType"];
    [fontDict setObject:@(textField.autocapitalizationType) forKey:@"autocapitalizationType"];
    
    [dict setObject:fontDict forKey:@"font"];
    [dict setObject:@(textField.secureTextEntry) forKey:@"isSecure"];
    [dict setObject:@(textField.enabled) forKey:@"enabled"];
}

@end
