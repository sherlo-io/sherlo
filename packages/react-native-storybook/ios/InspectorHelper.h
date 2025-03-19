#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <React/RCTBridgeModule.h>

@class ErrorHelper;
@class StableUIChecker;

@interface InspectorHelper : NSObject

+ (NSString *)dumpBoundaries:(NSError **)error;

- (instancetype)initWithErrorHelper:(ErrorHelper *)errorHelper;

- (void)getInspectorDataWithResolver:(RCTPromiseResolveBlock)resolve
                            rejecter:(RCTPromiseRejectBlock)reject;

- (void)checkIfStableWithRequiredMatches:(NSInteger)requiredMatches
                              intervalMs:(NSInteger)intervalMs
                               timeoutMs:(NSInteger)timeoutMs
                                resolver:(RCTPromiseResolveBlock)resolve
                                rejecter:(RCTPromiseRejectBlock)reject;

@property (nonatomic, strong) ErrorHelper *errorHelper;

@end
