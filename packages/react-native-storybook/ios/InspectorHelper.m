#import "InspectorHelper.h"
#import <UIKit/UIKit.h>
#import <React/UIView+React.h>
#import <stdlib.h>

static NSString *const LOG_TAG = @"SherloModule:InspectorHelper";
static const NSInteger MAX_DEPTH = 50;
static const NSInteger MAX_NODES = 10000;

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
                 reject:(RCTPromiseRejectBlock)reject {
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
 * Only traverses views that intersect the current screen viewport for performance.
 *
 * @param error Pointer to an NSError that will be populated if an error occurs
 * @return JSON string representing the view hierarchy and device metrics
 */
+ (NSString *)dumpBoundaries:(NSError **)error {
    UIWindow *keyWindow = nil;
    if (@available(iOS 13.0, *)) {
        NSSet<UIScene *> *scenes = UIApplication.sharedApplication.connectedScenes;
        UIScene *scene = scenes.allObjects.firstObject;
        if ([scene isKindOfClass:[UIWindowScene class]]) {
            UIWindowScene *windowScene = (UIWindowScene *)scene;
            keyWindow = windowScene.windows.firstObject;
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

    // Determine the visible viewport bounds (window coordinates)
    CGFloat viewportTop = 0;
    CGFloat viewportBottom = keyWindow.bounds.size.height;

    // Get hierarchical view structure, clipped to viewport
    NSInteger nodeCount = 0;
    NSDictionary *viewHierarchy = [self collectViewHierarchy:rootView depth:0 nodeCount:&nodeCount viewportTop:viewportTop viewportBottom:viewportBottom];

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
 * Only includes children whose bounds intersect the viewport [viewportTop, viewportBottom].
 * Parent containers that span beyond the viewport are always included (they intersect it),
 * but their off-screen children are skipped.
 *
 * @param view The view to collect information from
 * @param depth Current recursion depth
 * @param nodeCount Pointer to mutable counter tracking total nodes collected
 * @param viewportTop Top edge of the visible viewport in window coordinates
 * @param viewportBottom Bottom edge of the visible viewport in window coordinates
 * @return A dictionary representing the view and its children
 */
+ (NSDictionary *)collectViewHierarchy:(UIView *)view depth:(NSInteger)depth nodeCount:(NSInteger *)nodeCount viewportTop:(CGFloat)viewportTop viewportBottom:(CGFloat)viewportBottom {
    (*nodeCount)++;

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

    NSNumber *reactTag = view.reactTag;
    if (reactTag != nil) {
        [viewDict setObject:reactTag forKey:@"id"];
    } else {
        NSInteger nativeTag = view.tag;
        if (nativeTag > 0) {
            [viewDict setObject:@(nativeTag) forKey:@"id"];
        }
    }

    // Add children array
    // Skip children if we hit depth or node count limits
    // Skip children whose bounds are entirely outside the viewport
    NSMutableArray *children = [NSMutableArray array];
    if (depth < MAX_DEPTH && *nodeCount < MAX_NODES) {
        for (UIView *subview in view.subviews) {
            if (*nodeCount >= MAX_NODES) {
                break;
            }

            // Get child's position in window coordinates
            CGRect childWindowFrame = [subview convertRect:subview.bounds toView:nil];
            CGFloat childTop = childWindowFrame.origin.y;
            CGFloat childBottom = childTop + childWindowFrame.size.height;

            // Skip children entirely outside the viewport
            // A view intersects if: childTop < viewportBottom && childBottom > viewportTop
            if (childBottom <= viewportTop || childTop >= viewportBottom) {
                continue;
            }

            NSDictionary *childInfo = [self collectViewHierarchy:subview depth:depth + 1 nodeCount:nodeCount viewportTop:viewportTop viewportBottom:viewportBottom];
            [children addObject:childInfo];
        }
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
