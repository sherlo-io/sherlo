#import "StorybookMethodHandler.h"
#import "RestartHelper.h"
#import "VerificationHelper.h"

@implementation StorybookMethodHandler

- (instancetype)initWithBridge:(RCTBridge *)bridge
                   errorHelper:(ErrorHelper *)errorHelper
              syncDirectoryPath:(NSString *)syncDirectoryPath {
    self = [super init];
    if (self) {
        _bridge = bridge;
        _errorHelper = errorHelper;
        _syncDirectoryPath = [syncDirectoryPath copy];
    }
    return self;
}

- (void)verifyIntegrationWithResolver:(RCTPromiseResolveBlock)resolve
                             rejecter:(RCTPromiseRejectBlock)reject {
    [ModeHelper switchToVerificationMode:self.bridge];
    [ModeHelper scheduleVerification:[ModeHelper currentMode] syncDirectoryPath:self.syncDirectoryPath];
    resolve(nil);
}

- (void)toggleStorybookWithResolver:(RCTPromiseResolveBlock)resolve
                           rejecter:(RCTPromiseRejectBlock)reject {
    if ([ModeHelper isStorybookMode]) {
        [self closeStorybookWithResolver:resolve rejecter:reject];
    } else {
        [self openStorybookWithResolver:resolve rejecter:reject];
    }
}

- (void)openStorybookWithResolver:(RCTPromiseResolveBlock)resolve
                         rejecter:(RCTPromiseRejectBlock)reject {
    [ModeHelper switchToStorybookMode:self.bridge];
    resolve(nil);
}

- (void)closeStorybookWithResolver:(RCTPromiseResolveBlock)resolve
                          rejecter:(RCTPromiseRejectBlock)reject {
    [ModeHelper switchToDefaultMode:self.bridge];
    resolve(nil);
}

@end 