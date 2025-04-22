

NS_ASSUME_NONNULL_BEGIN

#ifdef RCT_NEW_ARCH_ENABLED

#import <sherlo_codegen/sherlo_codegen.h>
@interface SherloModule : NSObject <NativeSherloModuleSpec>

#else

#import <React/RCTBridgeModule.h>
@interface SherloModule : NSObject <RCTBridgeModule>

#endif

@end

NS_ASSUME_NONNULL_END
