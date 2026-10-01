#import <Foundation/Foundation.h>

/**
 * Spike: picks which sealed core the app runs and hands its source to JS.
 *
 * Order: a core in the app's storage folder (Documents/sherlo/sherlo-core.js) wins, but only when
 * its signature (sherlo-core.js.sig) verifies against Sherlo's public key and its seam is one this
 * SDK speaks. Otherwise the core shipped inside the SDK runs.
 */
@interface SherloCoreLoader : NSObject

/** JSON: { source, origin: "override" | "shipped" | "none", version, reason, nativeMs }. */
+ (NSString *)loadCoreJson;

@end
