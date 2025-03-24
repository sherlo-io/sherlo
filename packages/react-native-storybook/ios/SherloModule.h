#import <React/RCTBridgeModule.h>
#import <React/RCTBridge.h>
@class SherloModuleCore;

@interface SherloModule : NSObject <RCTBridgeModule>

@property (nonatomic, weak) RCTBridge *bridge;
@property (nonatomic, strong) SherloModuleCore *core;

@end
