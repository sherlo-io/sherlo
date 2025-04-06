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

    // TODO: Add properties based on class
    NSMutableDictionary *properties = [NSMutableDictionary dictionary];
    [self collectPropertiesFromView:view intoDict:properties];
    [viewDict setObject:properties forKey:@"properties"];
    
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
 * Determines which property collection method to use based on the view's class.
 *
 * @param view The view to collect properties from
 * @param properties Dictionary to store the collected properties
 */
+ (void)collectPropertiesFromView:(UIView *)view intoDict:(NSMutableDictionary *)properties {
    // Collect common properties available on all views
    [self collectCommonViewProperties:view intoDict:properties];
    
    NSString *className = NSStringFromClass([view class]);
    
    // Check specific view types
    if ([className containsString:@"RCTText"] || [className containsString:@"RCTTextView"]) {
        [self collectReactTextViewProperties:view intoDict:properties];
    } else if ([className containsString:@"RCTImageView"]) {
        [self collectReactImageViewProperties:view intoDict:properties];
    } else if ([className containsString:@"RCTSinglelineTextInputView"] || 
               [className containsString:@"RCTMultilineTextInputView"]) {
        [self collectReactTextInputViewProperties:view intoDict:properties];
    } else if ([className containsString:@"RCTScrollView"]) {
        [self collectReactScrollViewProperties:view intoDict:properties];
    } else if ([className containsString:@"RCTSwitch"]) {
        [self collectReactSwitchProperties:view intoDict:properties];
    } else if ([className containsString:@"RCTView"]) {
        [self collectReactViewProperties:view intoDict:properties];
    }
}

/**
 * Collects common properties available on all views.
 *
 * @param view The view to collect properties from
 * @param properties Dictionary to store the collected properties
 */
+ (void)collectCommonViewProperties:(UIView *)view intoDict:(NSMutableDictionary *)properties {
    // Background color
    if (view.backgroundColor) {
        CGFloat red, green, blue, alpha;
        if ([view.backgroundColor getRed:&red green:&green blue:&blue alpha:&alpha]) {
            NSString *hexColor = [NSString stringWithFormat:@"#%02X%02X%02X%02X", 
                                 (int)(red * 255), 
                                 (int)(green * 255), 
                                 (int)(blue * 255), 
                                 (int)(alpha * 255)];
            [properties setObject:hexColor forKey:@"backgroundColor"];
        }
    }
    
    // Opacity
    [properties setObject:@(view.alpha) forKey:@"opacity"];
    
    // Border properties
    if (view.layer.borderWidth > 0) {
        [properties setObject:@(view.layer.borderWidth) forKey:@"borderWidth"];
        
        CGColorRef borderColor = view.layer.borderColor;
        if (borderColor) {
            CGFloat components[4];
            size_t count = CGColorGetNumberOfComponents(borderColor);
            const CGFloat *rgba = CGColorGetComponents(borderColor);
            
            if (count == 2) {
                // Grayscale
                components[0] = rgba[0];
                components[1] = rgba[0];
                components[2] = rgba[0];
                components[3] = rgba[1];
            } else if (count == 4) {
                // RGBA
                components[0] = rgba[0];
                components[1] = rgba[1];
                components[2] = rgba[2];
                components[3] = rgba[3];
            }
            
            NSString *hexColor = [NSString stringWithFormat:@"#%02X%02X%02X%02X", 
                                 (int)(components[0] * 255), 
                                 (int)(components[1] * 255), 
                                 (int)(components[2] * 255), 
                                 (int)(components[3] * 255)];
            [properties setObject:hexColor forKey:@"borderColor"];
        }
    }
    
    // Corner radius
    if (view.layer.cornerRadius > 0) {
        [properties setObject:@(view.layer.cornerRadius) forKey:@"borderRadius"];
    }
    
    // Shadow properties
    if (view.layer.shadowOpacity > 0) {
        [properties setObject:@(view.layer.shadowOpacity) forKey:@"shadowOpacity"];
        [properties setObject:@(view.layer.shadowRadius) forKey:@"shadowRadius"];
        [properties setObject:@(view.layer.shadowOffset.width) forKey:@"shadowOffsetWidth"];
        [properties setObject:@(view.layer.shadowOffset.height) forKey:@"shadowOffsetHeight"];
        
        CGColorRef shadowColor = view.layer.shadowColor;
        if (shadowColor) {
            CGFloat components[4];
            size_t count = CGColorGetNumberOfComponents(shadowColor);
            const CGFloat *rgba = CGColorGetComponents(shadowColor);
            
            if (count == 2) {
                components[0] = rgba[0];
                components[1] = rgba[0];
                components[2] = rgba[0];
                components[3] = rgba[1];
            } else if (count == 4) {
                components[0] = rgba[0];
                components[1] = rgba[1];
                components[2] = rgba[2];
                components[3] = rgba[3];
            }
            
            NSString *hexColor = [NSString stringWithFormat:@"#%02X%02X%02X%02X", 
                                 (int)(components[0] * 255), 
                                 (int)(components[1] * 255), 
                                 (int)(components[2] * 255), 
                                 (int)(components[3] * 255)];
            [properties setObject:hexColor forKey:@"shadowColor"];
        }
    }
    
    // Test ID (often stored as accessibilityIdentifier)
    if (view.accessibilityIdentifier) {
        [properties setObject:view.accessibilityIdentifier forKey:@"testID"];
    }
    
    // Add accessibility properties
    NSMutableDictionary *accessibilityProps = [NSMutableDictionary dictionary];
    [self collectAccessibilityProperties:view intoDict:accessibilityProps];
    if (accessibilityProps.count > 0) {
        [properties setObject:accessibilityProps forKey:@"accessibility"];
    }
}

/**
 * Collects accessibility-related properties.
 *
 * @param view The view to collect properties from
 * @param properties Dictionary to store the collected properties
 */
+ (void)collectAccessibilityProperties:(UIView *)view intoDict:(NSMutableDictionary *)properties {
    // Is accessible
    [properties setObject:@(view.isAccessibilityElement) forKey:@"accessible"];
    
    // Accessibility label
    if (view.accessibilityLabel) {
        [properties setObject:view.accessibilityLabel forKey:@"accessibilityLabel"];
    }
    
    // Accessibility hint
    if (view.accessibilityHint) {
        [properties setObject:view.accessibilityHint forKey:@"accessibilityHint"];
    }
    
    // Accessibility value
    if (view.accessibilityValue) {
        [properties setObject:view.accessibilityValue forKey:@"accessibilityValue"];
    }
    
    // Accessibility traits
    UIAccessibilityTraits traits = view.accessibilityTraits;
    NSMutableArray *traitsArray = [NSMutableArray array];
    
    if (traits & UIAccessibilityTraitButton) {
        [traitsArray addObject:@"button"];
    }
    if (traits & UIAccessibilityTraitLink) {
        [traitsArray addObject:@"link"];
    }
    if (traits & UIAccessibilityTraitHeader) {
        [traitsArray addObject:@"header"];
    }
    if (traits & UIAccessibilityTraitSearchField) {
        [traitsArray addObject:@"search"];
    }
    if (traits & UIAccessibilityTraitImage) {
        [traitsArray addObject:@"image"];
    }
    if (traits & UIAccessibilityTraitSelected) {
        [traitsArray addObject:@"selected"];
    }
    if (traits & UIAccessibilityTraitPlaysSound) {
        [traitsArray addObject:@"playsSound"];
    }
    if (traits & UIAccessibilityTraitKeyboardKey) {
        [traitsArray addObject:@"key"];
    }
    if (traits & UIAccessibilityTraitStaticText) {
        [traitsArray addObject:@"text"];
    }
    if (traits & UIAccessibilityTraitSummaryElement) {
        [traitsArray addObject:@"summary"];
    }
    if (traits & UIAccessibilityTraitNotEnabled) {
        [traitsArray addObject:@"disabled"];
    }
    if (traits & UIAccessibilityTraitUpdatesFrequently) {
        [traitsArray addObject:@"updatesFrequently"];
    }
    if (traits & UIAccessibilityTraitStartsMediaSession) {
        [traitsArray addObject:@"startsMedia"];
    }
    if (traits & UIAccessibilityTraitAdjustable) {
        [traitsArray addObject:@"adjustable"];
    }
    if (traits & UIAccessibilityTraitAllowsDirectInteraction) {
        [traitsArray addObject:@"allowsDirectInteraction"];
    }
    if (traits & UIAccessibilityTraitCausesPageTurn) {
        [traitsArray addObject:@"pageTurn"];
    }
    
    if (traitsArray.count > 0) {
        [properties setObject:traitsArray forKey:@"accessibilityTraits"];
    }
}

/**
 * Collects properties specific to RCTView.
 *
 * @param view The view to collect properties from
 * @param properties Dictionary to store the collected properties
 */
+ (void)collectReactViewProperties:(UIView *)view intoDict:(NSMutableDictionary *)properties {
    // Most view properties are covered by common properties
    // Add any additional RCTView-specific properties here
}

/**
 * Collects properties specific to RCTTextView/RCTText.
 *
 * @param view The view to collect properties from
 * @param properties Dictionary to store the collected properties
 */
+ (void)collectReactTextViewProperties:(UIView *)view intoDict:(NSMutableDictionary *)properties {
    // Try to find the text in any label subviews
    UILabel *textLabel = nil;
    for (UIView *subview in view.subviews) {
        if ([subview isKindOfClass:[UILabel class]]) {
            textLabel = (UILabel *)subview;
            break;
        }
    }
    
    if (!textLabel) {
        // If no direct label subview, check if the view itself is a label
        if ([view isKindOfClass:[UILabel class]]) {
            textLabel = (UILabel *)view;
        }
    }
    
    if (textLabel) {
        // Text content
        if (textLabel.text) {
            [properties setObject:textLabel.text forKey:@"text"];
        }
        
        // Text color
        if (textLabel.textColor) {
            CGFloat red, green, blue, alpha;
            if ([textLabel.textColor getRed:&red green:&green blue:&blue alpha:&alpha]) {
                NSString *hexColor = [NSString stringWithFormat:@"#%02X%02X%02X%02X", 
                                     (int)(red * 255), 
                                     (int)(green * 255), 
                                     (int)(blue * 255), 
                                     (int)(alpha * 255)];
                [properties setObject:hexColor forKey:@"color"];
            }
        }
        
        // Enhanced font properties extraction
        if (textLabel.font) {
            [properties setObject:@(textLabel.font.pointSize) forKey:@"fontSize"];
            [properties setObject:textLabel.font.fontName forKey:@"fontFamily"];
            
            // More accurate font weight detection using UIFontDescriptor
            UIFontDescriptor *descriptor = textLabel.font.fontDescriptor;
            NSDictionary *traits = [descriptor objectForKey:UIFontDescriptorTraitsAttribute];
            
            if (traits) {
                // Get the symbolic traits
                UIFontDescriptorSymbolicTraits symbolicTraits = [traits[UIFontSymbolicTrait] unsignedIntValue];
                
                // Check for bold and italic
                BOOL isBold = (symbolicTraits & UIFontDescriptorTraitBold) != 0;
                BOOL isItalic = (symbolicTraits & UIFontDescriptorTraitItalic) != 0;
                
                // Get the weight value (ranges from -1.0 to 1.0, with 0.0 being regular)
                NSNumber *weightValue = traits[UIFontWeightTrait];
                NSString *fontWeight = @"normal";
                
                if (weightValue) {
                    CGFloat weight = [weightValue floatValue];
                    if (weight <= UIFontWeightUltraLight + 0.01) {
                        fontWeight = @"100";
                    } else if (weight <= UIFontWeightThin + 0.01) {
                        fontWeight = @"200";
                    } else if (weight <= UIFontWeightLight + 0.01) {
                        fontWeight = @"300";
                    } else if (weight <= UIFontWeightRegular + 0.01) {
                        fontWeight = @"normal"; // or "400"
                    } else if (weight <= UIFontWeightMedium + 0.01) {
                        fontWeight = @"500";
                    } else if (weight <= UIFontWeightSemibold + 0.01) {
                        fontWeight = @"600";
                    } else if (weight <= UIFontWeightBold + 0.01) {
                        fontWeight = @"bold"; // or "700"
                    } else if (weight <= UIFontWeightHeavy + 0.01) {
                        fontWeight = @"800";
                    } else {
                        fontWeight = @"900";
                    }
                } else if (isBold) {
                    fontWeight = @"bold";
                }
                
                [properties setObject:fontWeight forKey:@"fontWeight"];
                [properties setObject:(isItalic ? @"italic" : @"normal") forKey:@"fontStyle"];
            } else {
                // Fallback to simple method if traits not available
                if ([textLabel.font.fontName containsString:@"Bold"]) {
                    [properties setObject:@"bold" forKey:@"fontWeight"];
                } else {
                    [properties setObject:@"normal" forKey:@"fontWeight"];
                }
                
                if ([textLabel.font.fontName containsString:@"Italic"]) {
                    [properties setObject:@"italic" forKey:@"fontStyle"];
                } else {
                    [properties setObject:@"normal" forKey:@"fontStyle"];
                }
            }
            
            // Try to extract more details from RCTTextAttributes if available
            id textView = view;
            SEL textAttributesSelector = NSSelectorFromString(@"textAttributes");
            if ([textView respondsToSelector:textAttributesSelector]) {
                #pragma clang diagnostic push
                #pragma clang diagnostic ignored "-Warc-performSelector-leaks"
                id textAttributes = [textView performSelector:textAttributesSelector];
                #pragma clang diagnostic pop
                
                if (textAttributes) {
                    // Try to extract letter spacing
                    SEL letterSpacingSelector = NSSelectorFromString(@"letterSpacing");
                    if ([textAttributes respondsToSelector:letterSpacingSelector]) {
                        #pragma clang diagnostic push
                        #pragma clang diagnostic ignored "-Warc-performSelector-leaks"
                        CGFloat letterSpacing = [(NSNumber *)[textAttributes performSelector:letterSpacingSelector] floatValue];
                        #pragma clang diagnostic pop
                        if (letterSpacing != 0) {
                            [properties setObject:@(letterSpacing) forKey:@"letterSpacing"];
                        }
                    }
                    
                    // Try to extract line height
                    SEL lineHeightSelector = NSSelectorFromString(@"lineHeight");
                    if ([textAttributes respondsToSelector:lineHeightSelector]) {
                        #pragma clang diagnostic push
                        #pragma clang diagnostic ignored "-Warc-performSelector-leaks"
                        CGFloat lineHeight = [(NSNumber *)[textAttributes performSelector:lineHeightSelector] floatValue];
                        #pragma clang diagnostic pop
                        if (lineHeight != 0) {
                            [properties setObject:@(lineHeight) forKey:@"lineHeight"];
                        }
                    }
                }
            }
        }
        
        // Text alignment
        NSString *textAlign = @"left";
        if (textLabel.textAlignment == NSTextAlignmentCenter) {
            textAlign = @"center";
        } else if (textLabel.textAlignment == NSTextAlignmentRight) {
            textAlign = @"right";
        }
        [properties setObject:textAlign forKey:@"textAlign"];
        
        // Number of lines
        [properties setObject:@(textLabel.numberOfLines) forKey:@"numberOfLines"];
        
        // Line break mode (ellipsize)
        NSString *lineBreakMode = @"none";
        switch (textLabel.lineBreakMode) {
            case NSLineBreakByTruncatingTail:
                lineBreakMode = @"tail";
                break;
            case NSLineBreakByTruncatingMiddle:
                lineBreakMode = @"middle";
                break;
            case NSLineBreakByTruncatingHead:
                lineBreakMode = @"head";
                break;
            case NSLineBreakByClipping:
                lineBreakMode = @"clip";
                break;
            default:
                break;
        }
        [properties setObject:lineBreakMode forKey:@"ellipsizeMode"];
    }
}

/**
 * Collects properties specific to RCTImageView.
 *
 * @param view The view to collect properties from
 * @param properties Dictionary to store the collected properties
 */
+ (void)collectReactImageViewProperties:(UIView *)view intoDict:(NSMutableDictionary *)properties {
    UIImageView *imageView = nil;
    
    // Find UIImageView either as the view itself or a subview
    if ([view isKindOfClass:[UIImageView class]]) {
        imageView = (UIImageView *)view;
    } else {
        for (UIView *subview in view.subviews) {
            if ([subview isKindOfClass:[UIImageView class]]) {
                imageView = (UIImageView *)subview;
                break;
            }
        }
    }
    
    if (imageView) {
        // Content mode (resize mode)
        NSString *contentMode = @"cover";
        switch (imageView.contentMode) {
            case UIViewContentModeScaleToFill:
                contentMode = @"stretch";
                break;
            case UIViewContentModeScaleAspectFit:
                contentMode = @"contain";
                break;
            case UIViewContentModeScaleAspectFill:
                contentMode = @"cover";
                break;
            case UIViewContentModeCenter:
                contentMode = @"center";
                break;
            default:
                break;
        }
        [properties setObject:contentMode forKey:@"resizeMode"];
        
        // Tint color
        if (imageView.tintColor) {
            CGFloat red, green, blue, alpha;
            if ([imageView.tintColor getRed:&red green:&green blue:&blue alpha:&alpha]) {
                NSString *hexColor = [NSString stringWithFormat:@"#%02X%02X%02X%02X", 
                                     (int)(red * 255), 
                                     (int)(green * 255), 
                                     (int)(blue * 255), 
                                     (int)(alpha * 255)];
                [properties setObject:hexColor forKey:@"tintColor"];
            }
        }
    }
}

/**
 * Collects properties specific to RCTSinglelineTextInputView/RCTMultilineTextInputView.
 *
 * @param view The view to collect properties from
 * @param properties Dictionary to store the collected properties
 */
+ (void)collectReactTextInputViewProperties:(UIView *)view intoDict:(NSMutableDictionary *)properties {
    UITextField *textField = nil;
    UITextView *textView = nil;
    
    // Find text input either as direct subview or deeper
    for (UIView *subview in view.subviews) {
        if ([subview isKindOfClass:[UITextField class]]) {
            textField = (UITextField *)subview;
            break;
        } else if ([subview isKindOfClass:[UITextView class]]) {
            textView = (UITextView *)subview;
            break;
        }
        
        // Check one level deeper
        for (UIView *deeperSubview in subview.subviews) {
            if ([deeperSubview isKindOfClass:[UITextField class]]) {
                textField = (UITextField *)deeperSubview;
                break;
            } else if ([deeperSubview isKindOfClass:[UITextView class]]) {
                textView = (UITextView *)deeperSubview;
                break;
            }
        }
        
        if (textField || textView) break;
    }
    
    if (textField) {
        // Text content
        if (textField.text) {
            [properties setObject:textField.text forKey:@"text"];
        }
        
        // Placeholder
        if (textField.placeholder) {
            [properties setObject:textField.placeholder forKey:@"placeholder"];
        }
        
        // Placeholder color (requires extracting from attributedPlaceholder)
        if (textField.attributedPlaceholder) {
            NSDictionary *attributes = [textField.attributedPlaceholder attributesAtIndex:0 
                                                                          effectiveRange:NULL];
            UIColor *placeholderColor = attributes[NSForegroundColorAttributeName];
            if (placeholderColor) {
                CGFloat red, green, blue, alpha;
                if ([placeholderColor getRed:&red green:&green blue:&blue alpha:&alpha]) {
                    NSString *hexColor = [NSString stringWithFormat:@"#%02X%02X%02X%02X", 
                                         (int)(red * 255), 
                                         (int)(green * 255), 
                                         (int)(blue * 255), 
                                         (int)(alpha * 255)];
                    [properties setObject:hexColor forKey:@"placeholderTextColor"];
                }
            }
        }
        
        // Keyboard type
        [properties setObject:@(textField.keyboardType) forKey:@"keyboardType"];
        
        // Secure text entry
        [properties setObject:@(textField.secureTextEntry) forKey:@"secureTextEntry"];
        
        // Selection color (tint color)
        if (textField.tintColor) {
            CGFloat red, green, blue, alpha;
            if ([textField.tintColor getRed:&red green:&green blue:&blue alpha:&alpha]) {
                NSString *hexColor = [NSString stringWithFormat:@"#%02X%02X%02X%02X", 
                                     (int)(red * 255), 
                                     (int)(green * 255), 
                                     (int)(blue * 255), 
                                     (int)(alpha * 255)];
                [properties setObject:hexColor forKey:@"selectionColor"];
            }
        }
    } else if (textView) {
        // Text content
        if (textView.text) {
            [properties setObject:textView.text forKey:@"text"];
        }
        
        // Keyboard type
        [properties setObject:@(textView.keyboardType) forKey:@"keyboardType"];
        
        // Secure text entry
        [properties setObject:@(textView.secureTextEntry) forKey:@"secureTextEntry"];
        
        // Selection color (tint color)
        if (textView.tintColor) {
            CGFloat red, green, blue, alpha;
            if ([textView.tintColor getRed:&red green:&green blue:&blue alpha:&alpha]) {
                NSString *hexColor = [NSString stringWithFormat:@"#%02X%02X%02X%02X", 
                                     (int)(red * 255), 
                                     (int)(green * 255), 
                                     (int)(blue * 255), 
                                     (int)(alpha * 255)];
                [properties setObject:hexColor forKey:@"selectionColor"];
            }
        }
    }
}

/**
 * Collects properties specific to RCTScrollView.
 *
 * @param view The view to collect properties from
 * @param properties Dictionary to store the collected properties
 */
+ (void)collectReactScrollViewProperties:(UIView *)view intoDict:(NSMutableDictionary *)properties {
    UIScrollView *scrollView = nil;
    
    // Find UIScrollView either as the view itself or a subview
    if ([view isKindOfClass:[UIScrollView class]]) {
        scrollView = (UIScrollView *)view;
    } else {
        for (UIView *subview in view.subviews) {
            if ([subview isKindOfClass:[UIScrollView class]]) {
                scrollView = (UIScrollView *)subview;
                break;
            }
        }
    }
    
    if (scrollView) {
        // Content offset
        CGPoint contentOffset = scrollView.contentOffset;
        [properties setObject:@(contentOffset.x) forKey:@"contentOffsetX"];
        [properties setObject:@(contentOffset.y) forKey:@"contentOffsetY"];
        
        // Content size
        CGSize contentSize = scrollView.contentSize;
        [properties setObject:@(contentSize.width) forKey:@"contentWidth"];
        [properties setObject:@(contentSize.height) forKey:@"contentHeight"];
        
        // Scroll enabled
        [properties setObject:@(scrollView.isScrollEnabled) forKey:@"scrollEnabled"];
        
        // Scroll indicators
        [properties setObject:@(scrollView.showsVerticalScrollIndicator) forKey:@"showsVerticalScrollIndicator"];
        [properties setObject:@(scrollView.showsHorizontalScrollIndicator) forKey:@"showsHorizontalScrollIndicator"];
    }
}

/**
 * Collects properties specific to RCTSwitch.
 *
 * @param view The view to collect properties from
 * @param properties Dictionary to store the collected properties
 */
+ (void)collectReactSwitchProperties:(UIView *)view intoDict:(NSMutableDictionary *)properties {
    UISwitch *uiSwitch = nil;
    
    // Find UISwitch either as the view itself or a subview
    if ([view isKindOfClass:[UISwitch class]]) {
        uiSwitch = (UISwitch *)view;
    } else {
        for (UIView *subview in view.subviews) {
            if ([subview isKindOfClass:[UISwitch class]]) {
                uiSwitch = (UISwitch *)subview;
                break;
            }
        }
    }
    
    if (uiSwitch) {
        // Value (on/off)
        [properties setObject:@(uiSwitch.isOn) forKey:@"value"];
        
        // Thumb tint color
        if (uiSwitch.thumbTintColor) {
            CGFloat red, green, blue, alpha;
            if ([uiSwitch.thumbTintColor getRed:&red green:&green blue:&blue alpha:&alpha]) {
                NSString *hexColor = [NSString stringWithFormat:@"#%02X%02X%02X%02X", 
                                     (int)(red * 255), 
                                     (int)(green * 255), 
                                     (int)(blue * 255), 
                                     (int)(alpha * 255)];
                [properties setObject:hexColor forKey:@"thumbColor"];
            }
        }
        
        // On tint color (track color when on)
        if (uiSwitch.onTintColor) {
            CGFloat red, green, blue, alpha;
            if ([uiSwitch.onTintColor getRed:&red green:&green blue:&blue alpha:&alpha]) {
                NSString *hexColor = [NSString stringWithFormat:@"#%02X%02X%02X%02X", 
                                     (int)(red * 255), 
                                     (int)(green * 255), 
                                     (int)(blue * 255), 
                                     (int)(alpha * 255)];
                [properties setObject:hexColor forKey:@"onTintColor"];
            }
        }
        
        // Enabled state
        [properties setObject:@(!uiSwitch.isEnabled) forKey:@"disabled"];
    }
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

@end
