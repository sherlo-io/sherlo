#import <Foundation/Foundation.h>

/**
 * A story's request rules, answered in native code (src/mocking/networkNative tells which).
 *
 * A URL protocol is registered globally and put first in every session configuration made from
 * `defaultSessionConfiguration` or `ephemeralSessionConfiguration`, so a request a native library
 * makes itself (a picture downloaded to a file, an image view's own loader) meets the rules too.
 * With no rules in effect and requests let through, it takes no request. A release app outside a
 * test run installs none of it until JavaScript hands rules over (never, in default mode).
 */
@interface SherloRequestAnswers : NSObject

/** Put the rules in effect: the JSON src/mocking/networkNative hands over. */
+ (BOOL)setRulesJson:(NSString *)rulesJson;

@end
