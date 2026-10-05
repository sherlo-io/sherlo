#import <Foundation/Foundation.h>
#import "sherlo_core.h"

// The C core, linked in from SherloCore.xcframework, as the scroll engine and the inspector glue
// use it. A core that speaks a C ABI this glue does not know is never called.

/** The C core's ABI this glue knows (SHERLO_CORE_ABI when it was written). */
static const int32_t KNOWN_COMPILED_CORE_ABI = 1;

/** Why the C core cannot be used, or nil when it can. */
static inline NSString *CompiledCoreUnusableReason(void) {
    int32_t coreAbi = sherlo_core_abi();
    if (coreAbi == KNOWN_COMPILED_CORE_ABI) return nil;
    return [NSString stringWithFormat:@"the C core speaks ABI %d, this SDK knows ABI %d", coreAbi, KNOWN_COMPILED_CORE_ABI];
}

/** The C core's own version, or nil when it cannot be used. */
static inline NSString *CompiledCoreVersion(void) {
    if (CompiledCoreUnusableReason()) return nil;
    return [NSString stringWithUTF8String:sherlo_core_version()];
}
