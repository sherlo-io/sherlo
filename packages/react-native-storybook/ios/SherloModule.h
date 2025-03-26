#ifndef SherloModule_h
#define SherloModule_h

#if __has_include(<React/RCTBridgeModule.h>)
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#elif __has_include("React/RCTBridgeModule.h")
#import "React/RCTBridgeModule.h"
#import "React/RCTEventEmitter.h"
#elif __has_include("RCTBridgeModule.h")
#import "RCTBridgeModule.h"
#import "RCTEventEmitter.h"
#else
#import <React-Core/RCTBridgeModule.h>
#import <React-Core/RCTEventEmitter.h>
#endif

@interface SherloModule : RCTEventEmitter <RCTBridgeModule>

@end

#endif /* SherloModule_h */