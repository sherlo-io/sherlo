#import <Foundation/Foundation.h>

/**
 * Picks which sealed JS core the app runs, and hands its source to JavaScript.
 *
 * A core in the app's storage folder (Documents/sherlo/sherlo-core.js) wins, but only when its
 * signature (sherlo-core.js.sig) verifies against Sherlo's public key and its header names the
 * seam this SDK speaks. Otherwise the core shipped inside the SDK runs. A refused core is logged,
 * never thrown.
 */
@interface SherloCoreLoader : NSObject

/** JSON: { source, origin: "override" | "shipped" | "none", version, reason }. */
+ (NSString *)loadCoreJson;

@end
