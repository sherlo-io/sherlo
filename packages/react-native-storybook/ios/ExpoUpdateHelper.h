#import <Foundation/Foundation.h>

// Forward declarations for UIKit to avoid direct import in header
@class UIApplication;
@class NSURL;

@interface ExpoUpdateHelper : NSObject

+ (void)consumeExpoUpdateDeeplinkIfNeeded:(NSString *)expoUpdateDeeplink;

@end
