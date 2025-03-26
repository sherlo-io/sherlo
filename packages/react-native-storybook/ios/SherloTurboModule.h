#ifndef SherloTurboModuleHeader_h
#define SherloTurboModuleHeader_h

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

// C++ standard library headers
#include <memory>
#include <string>

// Forward declare necessary protocols
@protocol RCTTurboModule;
@protocol RCTTurboModuleRegistry;

// Declare SherloModule extension for TurboModule support
@interface SherloModule () <RCTTurboModule>
@property (nonatomic, weak, readwrite) id<RCTTurboModuleRegistry> turboModuleRegistry;
@end

#endif // RCT_NEW_ARCH_ENABLED

#endif /* SherloTurboModuleHeader_h */ 