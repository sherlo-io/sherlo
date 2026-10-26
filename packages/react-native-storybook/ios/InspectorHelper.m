#import "InspectorHelper.h"
#import "CompiledCore.h"
#import <UIKit/UIKit.h>
#import <React/UIView+React.h>
#import <stdlib.h>

static NSString *const LOG_TAG = @"SherloModule:InspectorHelper";

/** Whether the view itself is drawn: not hidden, not faded out, and in a window. */
static BOOL sherloViewIsDrawn(UIView *view) {
    return !view.hidden && view.alpha > 0.01 && view.window != nil;
}

/**
 * The views the walk keeps, in pre-order, as the C core reads them: one node per view, and the
 * table of class names the nodes point into.
 */
@interface SherloInspectorWalk : NSObject
@property (nonatomic, readonly) NSMutableData *nodes;
@property (nonatomic, readonly) int32_t nodeCount;
@property (nonatomic, readonly) NSMutableArray<NSString *> *classNames;
/** Each class's index in classNames, keyed by the class itself. */
@property (nonatomic, readonly) NSMutableDictionary *classIndexes;
@property (nonatomic) CGFloat screenScale;
@property (nonatomic) CGFloat viewportTop;
@property (nonatomic) CGFloat viewportBottom;
- (void)addNode:(sherlo_inspector_node)node;
- (int32_t)classIndexOf:(UIView *)view;
@end

@implementation SherloInspectorWalk

- (instancetype)init {
    if ((self = [super init])) {
        _nodes = [NSMutableData data];
        _classNames = [NSMutableArray array];
        _classIndexes = [NSMutableDictionary dictionary];
    }
    return self;
}

- (void)addNode:(sherlo_inspector_node)node {
    [_nodes appendBytes:&node length:sizeof(node)];
    _nodeCount++;
}

- (int32_t)classIndexOf:(UIView *)view {
    Class viewClass = [view class];
    NSNumber *known = _classIndexes[(id<NSCopying>)viewClass];
    if (known) return known.intValue;

    // Class name - always valid
    NSString *className = NSStringFromClass(viewClass);
    if (!className || className.length == 0) {
        className = @"Unknown";
    }
    int32_t index = (int32_t)_classNames.count;
    [_classNames addObject:className];
    _classIndexes[(id<NSCopying>)viewClass] = @(index);
    return index;
}

@end

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
 * Walks the views that intersect the current screen viewport, and has the C core write them, with
 * the device metrics, as JSON.
 *
 * @param error Pointer to an NSError that will be populated if an error occurs
 * @return JSON string representing the view hierarchy and device metrics
 */
+ (NSString *)dumpBoundaries:(NSError **)error {
    NSString *unusableReason = CompiledCoreUnusableReason();
    if (unusableReason) {
        if (error) {
            *error = [NSError errorWithDomain:@"InspectorHelper" code:4 userInfo:@{NSLocalizedDescriptionKey: unusableReason}];
        }
        return nil;
    }

    UIWindow *keyWindow = nil;
    UIView *rootView = [self rootView:&keyWindow error:error];
    if (!rootView) return nil;

    // Walk the view hierarchy, clipped to the visible viewport (window coordinates)
    SherloInspectorWalk *walk = [[SherloInspectorWalk alloc] init];
    walk.screenScale = [UIScreen mainScreen].nativeScale;
    walk.viewportTop = 0;
    walk.viewportBottom = keyWindow.bounds.size.height;
    CGRect rootWindowFrame = [rootView convertRect:rootView.bounds toView:nil];
    [self collectView:rootView depth:0 windowFrame:rootWindowFrame walk:walk];

    // Use the system's default font size for body text
    UIFont *defaultFont = [UIFont preferredFontForTextStyle:UIFontTextStyleBody];
    CGFloat defaultFontSize = defaultFont ? defaultFont.pointSize : [UIFont systemFontSize];
    CGFloat fontScale = defaultFontSize / [UIFont systemFontSize];

    // The class names, kept alive while the core reads their UTF-8
    NSUInteger classCount = walk.classNames.count;
    const char **classNames = calloc(classCount > 0 ? classCount : 1, sizeof(const char *));
    for (NSUInteger index = 0; index < classCount; index++) {
        classNames[index] = walk.classNames[index].UTF8String;
    }

    int64_t length = 0;
    char *json = sherlo_inspector_json(SHERLO_PLATFORM_IOS, (const sherlo_inspector_node *)walk.nodes.bytes, walk.nodeCount,
                                       classNames, (int32_t)classCount, walk.screenScale, fontScale,
                                       walk.viewportTop, walk.viewportBottom, &length);
    free(classNames);

    if (!json) {
        NSLog(@"[%@] The C core could not write the view data as JSON", LOG_TAG);
        if (error) {
            *error = [NSError errorWithDomain:@"InspectorHelper" code:3 userInfo:@{NSLocalizedDescriptionKey: @"Could not serialize view data to JSON"}];
        }
        return nil;
    }

    NSString *jsonString = [[NSString alloc] initWithBytes:json length:(NSUInteger)length encoding:NSUTF8StringEncoding];
    sherlo_free(json);
    return jsonString;
}

/**
 * Keeps one node for a view, then walks into its children.
 * Before each child the C core says whether the tree has room for it (depth and node limits) and
 * whether it intersects the viewport [viewportTop, viewportBottom]. A child it leaves out is not
 * walked into: parent containers that span beyond the viewport are kept (they intersect it), but
 * their off-screen children are skipped.
 *
 * @param view The view to collect information from
 * @param depth Current recursion depth
 * @param windowFrame The view's frame in window coordinates
 * @param walk The nodes kept so far, and the walk's screen scale and viewport
 */
+ (void)collectView:(UIView *)view depth:(int32_t)depth windowFrame:(CGRect)windowFrame walk:(SherloInspectorWalk *)walk {
    sherlo_inspector_node node;
    node.depth = depth;
    node.class_index = [walk classIndexOf:view];

    // Visibility
    node.is_visible = sherloViewIsDrawn(view) ? 1 : 0;

    // Frame in physical pixels; the core leaves out a number that is not finite
    node.x = windowFrame.origin.x * walk.screenScale;
    node.y = windowFrame.origin.y * walk.screenScale;
    node.width = windowFrame.size.width * walk.screenScale;
    node.height = windowFrame.size.height * walk.screenScale;

    long long viewId = [self idOf:view];
    node.has_id = viewId >= 0 ? 1 : 0;
    node.id = viewId;

    // The edges the viewport culling reads, in window coordinates
    node.top = windowFrame.origin.y;
    node.bottom = windowFrame.origin.y + windowFrame.size.height;

    [walk addNode:node];

    for (UIView *subview in view.subviews) {
        if (!sherlo_inspector_has_room(depth + 1, walk.nodeCount)) {
            break;
        }

        // Get child's position in window coordinates
        CGRect childWindowFrame = [subview convertRect:subview.bounds toView:nil];
        CGFloat childTop = childWindowFrame.origin.y;
        CGFloat childBottom = childTop + childWindowFrame.size.height;

        // Skip children entirely outside the viewport
        if (!sherlo_inspector_is_on_screen(childTop, childBottom, walk.viewportTop, walk.viewportBottom)) {
            continue;
        }

        [self collectView:subview depth:depth + 1 windowFrame:childWindowFrame walk:walk];
    }
}

+ (long long)idOf:(UIView *)view {
    if (view.reactTag != nil) return view.reactTag.longLongValue;
    if (view.tag > 0) return view.tag;
    return -1;
}

+ (UIWindow *)appWindow {
    if (@available(iOS 13.0, *)) {
        NSSet<UIScene *> *scenes = UIApplication.sharedApplication.connectedScenes;
        UIScene *scene = scenes.allObjects.firstObject;
        if ([scene isKindOfClass:[UIWindowScene class]]) {
            return ((UIWindowScene *)scene).windows.firstObject;
        }
    }
    return nil;
}

/**
 * The app's window and its root view, or nil with `error` set when the app has neither.
 */
+ (UIView *)rootView:(UIWindow **)keyWindowOut error:(NSError **)error {
    UIWindow *keyWindow = [self appWindow];

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
    if (keyWindowOut) *keyWindowOut = keyWindow;
    return rootView;
}

/**
 * Whether each view named by testID is drawn: walks the whole view tree (no viewport culling) as far
 * as the inspector's depth and node limits allow, and resolves a JSON object of
 * `visible` | `invisible` | `absent` | `unreached` by testID. React Native puts a view's testID in
 * its accessibilityIdentifier. A view is drawn when it, and every view above it, is not hidden, has
 * alpha above the inspector's threshold, sits in a window and has a width and a height. A testID
 * found twice is `visible` when any view carrying it is. A testID not found after the walk was cut
 * short at a limit is `unreached`: nothing can be said of it.
 */
+ (void)getViewVisibility:(NSString *)testIDsJson
                  resolve:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject {
    dispatch_async(dispatch_get_main_queue(), ^{
        NSString *unusableReason = CompiledCoreUnusableReason();
        if (unusableReason) {
            reject(@"E_INSPECTOR", unusableReason, nil);
            return;
        }
        NSArray *testIDs = [NSJSONSerialization JSONObjectWithData:[testIDsJson dataUsingEncoding:NSUTF8StringEncoding]
                                                           options:0
                                                             error:nil];
        if (![testIDs isKindOfClass:[NSArray class]]) {
            reject(@"E_INSPECTOR", @"The testIDs are not a JSON list", nil);
            return;
        }
        NSError *error = nil;
        UIView *rootView = [InspectorHelper rootView:nil error:&error];
        if (!rootView) {
            reject(@"E_INSPECTOR", @"Error getting the view tree", error);
            return;
        }

        NSSet *wanted = [NSSet setWithArray:testIDs];
        NSMutableDictionary<NSString *, NSString *> *found = [NSMutableDictionary dictionary];
        int32_t nodeCount = 0;
        BOOL cutShort = NO;
        [self findViews:rootView wanted:wanted ancestorsDrawn:YES depth:0 nodeCount:&nodeCount found:found cutShort:&cutShort];

        NSMutableDictionary<NSString *, NSString *> *states = [NSMutableDictionary dictionary];
        for (NSString *testID in testIDs) {
            states[testID] = found[testID] ?: (cutShort ? @"unreached" : @"absent");
        }
        NSData *data = [NSJSONSerialization dataWithJSONObject:states options:0 error:nil];
        resolve([[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding]);
    });
}

/**
 * Records the state of each wanted testID that `view` or a view below it carries, then walks into
 * its children while the inspector's limits leave room.
 */
+ (void)findViews:(UIView *)view
           wanted:(NSSet *)wanted
   ancestorsDrawn:(BOOL)ancestorsDrawn
            depth:(int32_t)depth
        nodeCount:(int32_t *)nodeCount
            found:(NSMutableDictionary<NSString *, NSString *> *)found
         cutShort:(BOOL *)cutShort {
    (*nodeCount)++;
    BOOL drawn = ancestorsDrawn && sherloViewIsDrawn(view) &&
                 view.bounds.size.width > 0 && view.bounds.size.height > 0;

    NSString *testID = view.accessibilityIdentifier;
    if (testID.length > 0 && [wanted containsObject:testID]) {
        // One drawn view is enough for visible; an invisible one never overwrites it.
        if (drawn) found[testID] = @"visible";
        else if (!found[testID]) found[testID] = @"invisible";
    }

    for (UIView *subview in view.subviews) {
        if (!sherlo_inspector_has_room(depth + 1, *nodeCount)) {
            *cutShort = YES;
            break;
        }
        [self findViews:subview wanted:wanted ancestorsDrawn:drawn depth:depth + 1 nodeCount:nodeCount found:found cutShort:cutShort];
    }
}

@end
