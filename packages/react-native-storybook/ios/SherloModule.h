// An event emitter, so each message the app's connection brings reaches the JavaScript as an event.
#import <React/RCTEventEmitter.h>

#ifdef RCT_NEW_ARCH_ENABLED

#import <sherlo_codegen/sherlo_codegen.h>

NS_ASSUME_NONNULL_BEGIN
@interface SherloModule : RCTEventEmitter <NativeSherloModuleSpec>
@end
NS_ASSUME_NONNULL_END
#else

#import <React/RCTBridgeModule.h>

NS_ASSUME_NONNULL_BEGIN
@interface SherloModule : RCTEventEmitter <RCTBridgeModule>
@end
NS_ASSUME_NONNULL_END

#endif
