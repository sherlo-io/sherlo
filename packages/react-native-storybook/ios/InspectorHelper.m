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

@end
