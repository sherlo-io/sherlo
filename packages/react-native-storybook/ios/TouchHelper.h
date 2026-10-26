#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>

/**
 * A scene's tap as a finger makes it: a touch UIKit delivers to every gesture recognizer on the
 * way, React Native's and gesture-handler's alike. Built from private UIKit and IOKit calls, each
 * looked up at run time, so a missing one refuses the tap and never crashes the app.
 */
@interface TouchHelper : NSObject

/**
 * Touch `window` at `point`, in points, for `holdMs`, then lift. Call on the main queue. Resolves,
 * once the touch ended, `{reachedReact, hitTag, hitClass, missing}`: whether a React Native or
 * gesture-handler recognizer took the touch, the React tag of the view it hit (-1 for none), the
 * hit view's class, and the private calls this iOS lacks - with any missing, nothing is touched.
 */
+ (void)tapInWindow:(UIWindow *)window
                 at:(CGPoint)point
             holdMs:(double)holdMs
            resolve:(RCTPromiseResolveBlock)resolve;

@end
