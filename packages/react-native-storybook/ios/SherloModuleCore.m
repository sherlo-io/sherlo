#import "SherloModuleCore.h"
#import "FileSystemHelper.h"
#import "ConfigHelper.h"
#import "LastStateHelper.h"
#import "RestartHelper.h"
#import "SherloJsonHelper.h"

#import <Foundation/Foundation.h>

// Mode constants
NSString * const MODE_DEFAULT = @"default";
NSString * const MODE_STORYBOOK = @"storybook";
NSString * const MODE_TESTING = @"testing";

// Module state - all decided pre-main and never re-derived.
static NSDictionary *config = nil;
static NSDictionary *lastState = nil;
static NSString *currentMode = MODE_DEFAULT;
static NSString *nativeVersion = nil;

/**
 * Core implementation for the Sherlo shim. Everything here runs BEFORE the
 * splice: the pre-main config read, and the developer-path mode switch
 * (openStorybook()/toggleStorybook() called with nothing injected). Every
 * method body that only makes sense once JS and a real test run exist -
 * screenshots, settle, scroll, inspector data - has moved to the injected
 * implementation.
 */
@implementation SherloModuleCore

/**
 * Reads config, lastState and nativeVersion off disk before any JS exists.
 * This is the pre-main native config read the design calls out: a
 * late-attached implementation reads these frozen values off the shim and
 * never re-derives them.
 */
- (instancetype)init {
    self = [super init];

    FileSystemHelper *fileSystemHelper = [[FileSystemHelper alloc] init];

    nativeVersion = [SherloJsonHelper getNativeVersion];

    config = [ConfigHelper loadConfig:fileSystemHelper];

    if (config) {
        currentMode = [ConfigHelper determineModeFromConfig:config];

        if ([currentMode isEqualToString:MODE_TESTING]) {
            lastState = [LastStateHelper getLastState:fileSystemHelper];
        }
    }

    return self;
}

/**
 * Returns constants that will be exposed to JavaScript. Exactly four keys -
 * mode, config, lastState, nativeVersion - frozen by the design.
 */
- (NSDictionary *)getSherloConstants {
    NSString *configString = nil;
    if (config) {
        NSError *error = nil;
        NSData *jsonData = [NSJSONSerialization dataWithJSONObject:config options:0 error:&error];
        if (!error) {
        configString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
        }
    }

    NSString *lastStateString = nil;
    if (lastState) {
        NSError *error = nil;
        NSData *jsonData = [NSJSONSerialization dataWithJSONObject:lastState options:0 error:&error];
        if (!error) {
            lastStateString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
        }
    }

    return @{
        @"mode": currentMode,
        @"config": configString ?: [NSNull null],
        @"lastState": lastStateString ?: [NSNull null],
        @"nativeVersion": nativeVersion ?: [NSNull null]
    };
}

/**
 * The developer path: set the mode and, when requested, reload. No policy - a
 * flag and a reload, nothing else - because policy frozen at a customer's
 * build can never be corrected. An injected implementation is consulted first
 * (see SherloModule.mm's invokeSync) and can override this.
 *
 * 'toggle' is resolved against the CURRENT mode here rather than computed in
 * JS, because only native holds that value.
 */
- (void)setMode:(NSString *)mode reload:(BOOL)reload {
    if ([mode isEqualToString:@"toggle"]) {
        currentMode = [currentMode isEqualToString:MODE_STORYBOOK] ? MODE_DEFAULT : MODE_STORYBOOK;
    } else {
        currentMode = mode;
    }

    if (reload) {
        [RestartHelper restart];
    }
}

@end
