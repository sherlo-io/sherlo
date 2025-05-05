#import <Foundation/Foundation.h>

@interface ExpoUpdateHelper : NSObject

+ (BOOL)consumeExpoUpdateDeeplinkIfNeeded:(NSString *)expoUpdateDeeplink;

@end
