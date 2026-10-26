#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>

@interface InspectorHelper : NSObject

/**
 * The app's window: the one whose root view the inspector measures every frame in. A touch meant for
 * a frame the inspector read goes to this window, never to another that happens to be key.
 */
+ (UIWindow *)appWindow;

/** The id the inspector gives a view: its React tag, else its native tag when above 0; -1 for none. */
+ (long long)idOf:(UIView *)view;

+ (void)getInspectorData:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject;

+ (void)getViewVisibility:(NSString *)testIDsJson
                  resolve:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject;

@end
