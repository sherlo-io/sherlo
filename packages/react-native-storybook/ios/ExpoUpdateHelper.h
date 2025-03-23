#import <Foundation/Foundation.h>

@interface ExpoUpdateHelper : NSObject

+ (void)consumeExpoUpdateDeeplink:(NSString *)expoUpdateDeeplink
                          error:(NSError **)error;
+ (BOOL)wasDeeplinkConsumed;

@end
