#import "SherloTurboModule.h"

@implementation SherloTurboModule

RCT_EXPORT_MODULE(SherloTurbo)

// Implementation of the hello method from NativeSherloTurbo.ts
RCT_EXPORT_METHOD(hello:(NSString *)name
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSString *greeting = [NSString stringWithFormat:@"Hello, %@!", name];
  resolve(greeting);
}

// This is only needed for the New Architecture
#ifdef RCT_NEW_ARCH_ENABLED
#if __has_include(<SherloTurboSpec/SherloTurboSpec.h>)
- (NSString *)hello:(NSString *)name
{
  return [NSString stringWithFormat:@"Hello, %@!", name];
}

// Required implementation for Turbo Native Module
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeSherloTurboSpecJSI>(params);
}
#endif
#endif

@end 