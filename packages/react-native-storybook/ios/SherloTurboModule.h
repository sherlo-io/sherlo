#ifndef SherloTurboModule_h
#define SherloTurboModule_h

#ifdef RCT_NEW_ARCH_ENABLED

// React Native headers
#if __has_include(<React/RCTTurboModule.h>)
#import <React/RCTTurboModule.h>
#elif __has_include("React/RCTTurboModule.h")
#import "React/RCTTurboModule.h"
#elif __has_include("RCTTurboModule.h")
#import "RCTTurboModule.h"
#else
#import <ReactCommon/RCTTurboModule.h>
#endif

#import <React/RCTBridgeModule.h>
#import <React/RCTUtils.h>
#import <React/RCTEventEmitter.h>

// C++ standard library headers
#include <memory>
#include <string>

// Forward declare necessary protocols
@protocol RCTTurboModule;
@protocol RCTTurboModuleRegistry;

// Import base module header
#import "SherloModule.h"

// Actual TurboModule class definition
@interface SherloTurboModule : RCTEventEmitter <RCTBridgeModule, RCTTurboModule>
@property (nonatomic, weak, readwrite) id<RCTTurboModuleRegistry> turboModuleRegistry;
@end

#endif // RCT_NEW_ARCH_ENABLED

#endif /* SherloTurboModule_h */ 