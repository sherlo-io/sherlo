

#ifdef RCT_NEW_ARCH_ENABLED

#import <sherlo_codegen/sherlo_codegen.h>
#import <ReactCommon/RCTTurboModuleWithJSIBindings.h>

NS_ASSUME_NONNULL_BEGIN
@interface SherloModule : NSObject <NativeSherloModuleSpec, RCTTurboModuleWithJSIBindings>
@end
NS_ASSUME_NONNULL_END
#else

#import <React/RCTBridgeModule.h>

NS_ASSUME_NONNULL_BEGIN
@interface SherloModule : NSObject <RCTBridgeModule>
@end
NS_ASSUME_NONNULL_END

#endif


