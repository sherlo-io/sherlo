#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

@interface InspectorHelper : NSObject

+ (void)getInspectorData:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject;

@end
