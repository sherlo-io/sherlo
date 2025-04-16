#import <React/RCTBridgeModule.h>

#ifdef RCT_NEW_ARCH_ENABLED
#if __has_include(<SherloTurboSpec/SherloTurboSpec.h>)
#import <SherloTurboSpec/SherloTurboSpec.h>
#endif
#endif

NS_ASSUME_NONNULL_BEGIN

@interface SherloTurboModule : NSObject <RCTBridgeModule>
@end

#ifdef RCT_NEW_ARCH_ENABLED
#if __has_include(<SherloTurboSpec/SherloTurboSpec.h>)
@interface SherloTurboModule () <NativeSherloTurboSpec>
@end
#endif
#endif

NS_ASSUME_NONNULL_END 