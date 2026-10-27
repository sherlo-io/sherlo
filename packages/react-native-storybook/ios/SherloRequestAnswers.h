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

/**
 * Who is told, as JSON `{method, url, contentType?}` and never a body or headers, of each request
 * native code meets that no rule in effect matches (SherloModule raises it to JavaScript as a
 * `SherloUnansweredRequest` event). Nothing is told before rules were handed over.
 */
+ (void)setUnansweredReceiver:(void (^)(NSString *requestJson))receiver;

@end
