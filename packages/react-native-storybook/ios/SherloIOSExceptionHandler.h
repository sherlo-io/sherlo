#import <Foundation/Foundation.h>

@interface SherloIOSExceptionHandler : NSObject

+ (void)install;

/** A new start of the JavaScript: its first error is reported again. */
+ (void)javaScriptStarted;

@end
