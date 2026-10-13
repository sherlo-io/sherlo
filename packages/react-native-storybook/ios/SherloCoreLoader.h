#import <Foundation/Foundation.h>

/**
 * Picks which sealed JS core the app runs, and hands its source to JavaScript.
 *
 * A core the runner sent in its `config` wins, but only when its signature verifies against
 * Sherlo's public key and its header names the seam this SDK speaks. Otherwise the core shipped
 * inside the SDK runs. A refused core is logged, never thrown.
 */
@interface SherloCoreLoader : NSObject

/**
 * Keep the core the runner sent, with its base64 RSA-SHA256 signature, for every later start of
 * the JavaScript. Nothing is checked here: the check runs each time a core is picked.
 */
+ (void)keepSentCore:(NSString *)source signature:(NSString *)signature;

/** JSON: { source, origin: "override" | "shipped" | "none", version, reason }. */
+ (NSString *)loadCoreJson;

@end
