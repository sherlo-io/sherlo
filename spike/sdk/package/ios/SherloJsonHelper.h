#import <Foundation/Foundation.h>

@interface SherloJsonHelper : NSObject

// Reads from bundled sherlo.json, returns nil if missing
+ (NSString *)getNativeVersion;

@end
