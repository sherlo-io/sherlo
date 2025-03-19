#import <Foundation/Foundation.h>
#import <React/RCTBridge.h>

typedef NS_ENUM(NSInteger, SherloMode) {
    SherloModeDefault,
    SherloModeStorybook,
    SherloModeTesting,
    SherloModeVerification
};

@interface ModeHelper : NSObject

+ (NSString *)currentMode;
+ (void)setMode:(NSString *)newMode;
+ (BOOL)isDefaultMode;
+ (BOOL)isStorybookMode;
+ (BOOL)isTestingMode;
+ (BOOL)isVerificationMode;
+ (void)switchToDefaultMode:(RCTBridge *)bridge;
+ (void)switchToStorybookMode:(RCTBridge *)bridge;
+ (void)switchToTestingMode:(RCTBridge *)bridge;
+ (void)switchToVerificationMode:(RCTBridge *)bridge;
+ (void)scheduleVerification:(NSString *)mode syncDirectoryPath:(NSString *)syncDirectoryPath;

@end 