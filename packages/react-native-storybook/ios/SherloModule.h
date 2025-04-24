

#ifdef RCT_NEW_ARCH_ENABLED

#import <sherlo_codegen/sherlo_codegen.h>

NS_ASSUME_NONNULL_BEGIN
@interface SherloModule : NSObject <NativeSherloModuleSpec>
@end
NS_ASSUME_NONNULL_END
#else

#import <React/RCTBridgeModule.h>

NS_ASSUME_NONNULL_BEGIN
@interface SherloModule : NSObject <RCTBridgeModule>
@end
NS_ASSUME_NONNULL_END

#endif



