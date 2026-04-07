#import "SherloJsonHelper.h"

static NSString *const LOG_TAG = @"SherloModule:SherloJsonHelper";

/**
 * Helper for reading sherlo.json from bundled assets.
 */
@implementation SherloJsonHelper

/**
 * Returns the native version string from sherlo.json bundled assets, or nil if missing/unreadable.
 *
 * @return The version string, or nil if missing or unreadable
 */
+ (NSString *)getNativeVersion {
    NSBundle *podBundle = [NSBundle bundleForClass:[SherloJsonHelper class]];
    NSString *sherloJsonPath = [podBundle pathForResource:@"sherlo" ofType:@"json" inDirectory:@"assets"];
    if (!sherloJsonPath) {
        return nil;
    }
    NSData *sherloJsonData = [NSData dataWithContentsOfFile:sherloJsonPath];
    if (!sherloJsonData) {
        return nil;
    }
    NSDictionary *sherloJson = [NSJSONSerialization JSONObjectWithData:sherloJsonData options:0 error:nil];
    return sherloJson[@"version"];
}

@end
