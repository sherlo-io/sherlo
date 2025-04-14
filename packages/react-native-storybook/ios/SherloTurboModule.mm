#ifdef RCT_NEW_ARCH_ENABLED

#import "SherloTurboModule.h"
#import "SherloModuleCore.h"

#import <React/RCTBridge.h>
#import <React/RCTConvert.h>

/**
 * Turbo Module implementation for Sherlo.
 * This file is only used when RCT_NEW_ARCH_ENABLED is defined.
 */
@implementation SherloTurboModule

// Synthesize the turboModuleRegistry from RCTTurboModule protocol
@synthesize turboModuleRegistry = _turboModuleRegistry;

/**
 * Required method to register the module with React Native.
 * Sets the module name that will be used to access it from JavaScript.
 * IMPORTANT: Use the same name as in the codegenConfig to ensure correct code generation.
 */
RCT_EXPORT_MODULE("SherloModuleSpec")

@synthesize bridge = _bridge;

static SherloModuleCore *core;

/**
 * Required method to initialize the module.
 * Creates the core instance and initializes it.
 *
 * @return An initialized SherloModule instance
 */
- (instancetype)init {
    self = [super init];
    if (self) {
        core = [[SherloModuleCore alloc] init];
    }
    return self;
}

/**
 * Provides constants that are accessible from JavaScript.
 * These constants include mode values and other configuration.
 *
 * @return Dictionary of constant values
 */
- (NSDictionary *)constantsToExport {
    return @{
        @"storybookViewModes": @{
            @"FULL_SCREEN": @"FULL_SCREEN",
            @"OVERLAY": @"OVERLAY",
            @"HIDDEN": @"HIDDEN",
        }
    };
}

/**
 * Indicates that this module should be initialized on the main thread.
 * This is necessary because the module interacts with UI components.
 *
 * @return YES to initialize on the main thread
 */
+ (BOOL)requiresMainQueueSetup {
    return YES;
}

// Specifies the dispatch queue on which the module's methods should be executed.
- (dispatch_queue_t)methodQueue {
    return dispatch_get_main_queue();
}

// Turbo Module implementation methods

- (void)toggleStorybook:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [core toggleStorybook:self.bridge];
    resolve(nil);
}

- (void)openStorybook:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [core openStorybook:self.bridge];
    resolve(nil);
}

- (void)closeStorybook:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [core closeStorybook:self.bridge];
    resolve(nil);
}

- (void)appendFile:(NSString *)path content:(NSString *)content resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [core appendFile:path withContent:content resolver:resolve rejecter:reject];
}

- (void)readFile:(NSString *)path resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [core readFile:path resolver:resolve rejecter:reject];
}

- (void)getInspectorData:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [core getInspectorData:resolve rejecter:reject];
}

- (void)stabilize:(double)requiredMatches intervalMs:(double)intervalMs timeoutMs:(double)timeoutMs resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [core stabilize:(NSInteger)requiredMatches intervalMs:(NSInteger)intervalMs timeoutMs:(NSInteger)timeoutMs resolver:resolve rejecter:reject];
}

// Required method from RCTTurboModule protocol
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params {
  // For now, return nullptr - actual implementation requires codegen to run first
  // When codegen runs successfully, replace this with:
  // return std::make_shared<facebook::react::NativeSherloModuleSpecJSI>(params);
  return nullptr;
}

@end

#endif 