#import <React/RCTBridgeModule.h>

#ifdef RCT_NEW_ARCH_ENABLED
#if __has_include(<SherloTurboSpec/SherloTurboSpec.h>)
#import <SherloTurboSpec/SherloTurboSpec.h>
#endif
#endif

NS_ASSUME_NONNULL_BEGIN

@interface TurboSherloModule : NSObject <RCTBridgeModule>
@end

#ifdef RCT_NEW_ARCH_ENABLED
#if __has_include(<SherloTurboSpec/SherloTurboSpec.h>)
@interface TurboSherloModule () <NativeSherloTurboSpec>
@end
#endif
#endif

NS_ASSUME_NONNULL_END 