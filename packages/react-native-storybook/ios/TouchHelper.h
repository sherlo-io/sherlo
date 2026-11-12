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
 * Touch `point`, in points, for `holdMs`, then lift, in the topmost of `windows` (given topmost
 * first) that takes a touch there. Call on the main queue. Resolves, once the touch ended,
 * `{reachedReact, hitTag, hitClass, missing}`: whether a React Native or gesture-handler
 * recognizer took the touch, the React tag of the view it hit (-1 for none), the hit view's class,
 * and the private calls this iOS lacks - with any missing, nothing is touched. When no window
 * takes a touch there, nothing is touched, `hitClass` is the lowest window's and `windows`, the
 * class names of the windows looked in, is added.
 */
+ (void)tapInWindows:(NSArray<UIWindow *> *)windows
                  at:(CGPoint)point
              holdMs:(double)holdMs
             resolve:(RCTPromiseResolveBlock)resolve;

/**
 * Put a finger down at `from` in the topmost of `windows` that takes a touch there, drag it in a
 * straight line to `to`, in points, over `durationMs` with a move about every 1/60 s, then lift.
 * Call on the main queue. Resolves, once the finger lifted, what the tap resolves, read where the
 * finger went down.
 */
+ (void)swipeInWindows:(NSArray<UIWindow *> *)windows
                  from:(CGPoint)from
                    to:(CGPoint)to
            durationMs:(double)durationMs
               resolve:(RCTPromiseResolveBlock)resolve;

@end
