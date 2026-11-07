#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>

@interface InspectorHelper : NSObject

/**
 * The app's window: the one whose root view the inspector measures every frame in. A touch meant for
 * a frame the inspector read goes to this window, never to another that happens to be key.
 */
+ (UIWindow *)appWindow;

/**
 * Every window of the app that is shown, topmost first: an alert, an action sheet or a system sheet
 * lives in a window of its own above the app's.
 */
+ (NSArray<UIWindow *> *)visibleWindows;

/**
 * The views that carry an accessibility label in each visible window, topmost window first, as
 * `{name, views: [{label, x, y, width, height}]}` with frames in points: a target is found by its
 * label in whichever window shows it.
 */
+ (NSArray<NSDictionary *> *)labeledViewsByWindow;

/** The id the inspector gives a view: its React tag, else its native tag when above 0; -1 for none. */
+ (long long)idOf:(UIView *)view;

+ (void)getInspectorData:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject;

+ (void)getViewVisibility:(NSString *)testIDsJson
                  resolve:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject;

@end
