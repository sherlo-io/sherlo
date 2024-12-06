#import <Foundation/Foundation.h>

@interface ExpoUpdateHelper : NSObject

+ (void)consumeExpoUpdateDeeplink:(NSString *)expoUpdateDeeplink
                        modeRef:(NSString **)modeRef
                          error:(NSError **)error;

@end
