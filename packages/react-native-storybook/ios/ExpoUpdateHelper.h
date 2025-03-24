#import <Foundation/Foundation.h>

@interface ExpoUpdateHelper : NSObject

+ (void)consumeExpoUpdateDeeplinkIfNeeded:(NSString *)expoUpdateDeeplink
                               lastState:(NSDictionary *)lastState
                                 logTag:(NSString *)logTag;

@end
