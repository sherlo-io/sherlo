#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

@interface InspectorHelper : NSObject

+ (void)getInspectorDataWithResolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject;

@end
