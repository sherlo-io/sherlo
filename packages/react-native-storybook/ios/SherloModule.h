#import <React/RCTBridgeModule.h>

#ifdef RCT_NEW_ARCH_ENABLED
#if __has_include(<SherloModuleSpec/SherloModuleSpec.h>)
#import <SherloModuleSpec/SherloModuleSpec.h>
#endif
#endif

NS_ASSUME_NONNULL_BEGIN

@interface SherloModule : NSObject <RCTBridgeModule>
@end

#ifdef RCT_NEW_ARCH_ENABLED
#if __has_include(<SherloModuleSpec/SherloModuleSpec.h>)
@interface SherloModule () <NativeSherloModuleSpec>
@end
#endif
#endif

NS_ASSUME_NONNULL_END 