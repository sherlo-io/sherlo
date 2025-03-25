#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

@interface InspectorHelper : NSObject

+ (void)getInspectorData:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject;

@end
