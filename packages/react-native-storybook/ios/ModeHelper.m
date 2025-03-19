#import "ModeHelper.h"
#import "RestartHelper.h"
#import "VerificationHelper.h"

static NSString *mode = @"default"; // "default" / "storybook" / "testing" / "verification"

@implementation ModeHelper

+ (NSString *)currentMode {
    return mode;
}

+ (void)setMode:(NSString *)newMode {
    mode = newMode;
}

+ (BOOL)isDefaultMode {
    return [mode isEqualToString:@"default"];
}

+ (BOOL)isStorybookMode {
    return [mode isEqualToString:@"storybook"];
}

+ (BOOL)isTestingMode {
    return [mode isEqualToString:@"testing"];
}

+ (BOOL)isVerificationMode {
    return [mode isEqualToString:@"verification"];
}

+ (void)switchToDefaultMode:(RCTBridge *)bridge {
    mode = @"default";
    [RestartHelper reloadWithBridge:bridge];
}

+ (void)switchToStorybookMode:(RCTBridge *)bridge {
    mode = @"storybook";
    [RestartHelper reloadWithBridge:bridge];
}

+ (void)switchToTestingMode:(RCTBridge *)bridge {
    mode = @"testing";
    [RestartHelper reloadWithBridge:bridge];
}

+ (void)switchToVerificationMode:(RCTBridge *)bridge {
    mode = @"verification";
    [RestartHelper reloadWithBridge:bridge];
    [self scheduleVerification:mode syncDirectoryPath:nil];
}

+ (void)scheduleVerification:(NSString *)mode syncDirectoryPath:(NSString *)syncDirectoryPath {
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 1 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
        [VerificationHelper verifyIntegrationWithMode:mode syncDirectoryPath:syncDirectoryPath];
    });
}

@end 