#import "SherloModule.h"
#import "SherloModuleCore.h"
#import <React/RCTUtils.h>
#import <React/RCTUIManagerUtils.h>
#import <React/RCTBridge.h>

@implementation SherloModule

RCT_EXPORT_MODULE(SherloModule)

@synthesize bridge = _bridge;

static SherloModuleCore *core;

/**
 * Required method to initialize the module.
 * Creates the core instance and initializes it.
 */
- (instancetype)init {
    self = [super init];
    if (self) {
        core = [[SherloModuleCore alloc] init];
    }
    return self;
}

/**
 * Indicates that this module should be initialized on the main thread.
 */
+ (BOOL)requiresMainQueueSetup {
    return YES;
}

// Specifies the dispatch queue on which the module's methods should be executed.
- (dispatch_queue_t)methodQueue {
    return RCTGetUIManagerQueue();
}

#pragma mark - Old Architecture Methods

/**
 * Returns the Sherlo constants.
 */
- (NSDictionary *)constantsToExport
{
    return [core getSherloConstants];
}

/**
 * Toggles between Storybook and default modes.
 */
RCT_EXPORT_METHOD(toggleStorybook) {
    [core toggleStorybook:self.bridge];
}

/**
 * Explicitly switches to Storybook mode.
 */
RCT_EXPORT_METHOD(openStorybook) {
    [core openStorybook:self.bridge];
}

/**
 * Explicitly switches to default mode.
 */
RCT_EXPORT_METHOD(closeStorybook) {
    [core closeStorybook:self.bridge];
}

/**
 * Appends base64 encoded content to a file.
 */
RCT_EXPORT_METHOD(appendFile:(NSString *)path
                  withContent:(NSString *)content
                     resolver:(RCTPromiseResolveBlock)resolve
                     rejecter:(RCTPromiseRejectBlock)reject) {
    [core appendFile:path withContent:content resolver:resolve rejecter:reject];
}

/**
 * Reads a file and returns its contents as base64 encoded string.
 */
RCT_EXPORT_METHOD(readFile:(NSString *)path
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    [core readFile:path resolver:resolve rejecter:reject];
}

/**
 * Gets UI inspector data from the current view hierarchy.
 */
RCT_EXPORT_METHOD(getInspectorData:(RCTPromiseResolveBlock)resolve
                          rejecter:(RCTPromiseRejectBlock)reject) {
    [core getInspectorData:resolve rejecter:reject];
}

/**
 * Checks UI stability by comparing screenshots taken over a specified interval.
 * The saveScreenshots parameter is accepted for cross-platform compatibility but not used in iOS.
 */
RCT_EXPORT_METHOD(stabilize:(NSInteger)requiredMatches
                 intervalMs:(NSInteger)intervalMs
                  timeoutMs:(NSInteger)timeoutMs
                  saveScreenshots:(BOOL)saveScreenshots
                   resolver:(RCTPromiseResolveBlock)resolve
                   rejecter:(RCTPromiseRejectBlock)reject) {
    [core stabilize:requiredMatches intervalMs:intervalMs timeoutMs:timeoutMs resolver:resolve rejecter:reject];
}

#pragma mark - New Architecture

#ifdef RCT_NEW_ARCH_ENABLED
#if __has_include(<SherloModuleSpec/SherloModuleSpec.h>)

// New Architecture implementation for getSherloConstants
- (NSDictionary *)getSherloConstants {
    return [core getSherloConstants];
}

// New Architecture implementation for hello
- (NSString *)hello:(NSString *)name
{
  return [NSString stringWithFormat:@"Hello, %@!", name];
}

// New Architecture implementation for toggleStorybook
- (void)toggleStorybook
{
  [core toggleStorybook:self.bridge];
}

// New Architecture implementation for openStorybook
- (void)openStorybook
{
  [core openStorybook:self.bridge];
}

// New Architecture implementation for closeStorybook
- (void)closeStorybook
{
  [core closeStorybook:self.bridge];
}

// New Architecture implementation for appendFile
- (void)appendFile:(NSString *)path
      withContent:(NSString *)content
         resolver:(RCTPromiseResolveBlock)resolve
         rejecter:(RCTPromiseRejectBlock)reject
{
  [core appendFile:path withContent:content resolver:resolve rejecter:reject];
}

// New Architecture implementation for readFile
- (void)readFile:(NSString *)path
        resolver:(RCTPromiseResolveBlock)resolve
        rejecter:(RCTPromiseRejectBlock)reject
{
  [core readFile:path resolver:resolve rejecter:reject];
}

// New Architecture implementation for getInspectorData
- (void)getInspectorData:(RCTPromiseResolveBlock)resolve
                rejecter:(RCTPromiseRejectBlock)reject
{
  [core getInspectorData:resolve rejecter:reject];
}

// New Architecture implementation for stabilize
// The saveScreenshots parameter is accepted for cross-platform compatibility but not used in iOS
- (void)stabilize:(NSInteger)requiredMatches
       intervalMs:(NSInteger)intervalMs
        timeoutMs:(NSInteger)timeoutMs
  saveScreenshots:(BOOL)saveScreenshots
         resolver:(RCTPromiseResolveBlock)resolve
         rejecter:(RCTPromiseRejectBlock)reject
{
  [core stabilize:requiredMatches intervalMs:intervalMs timeoutMs:timeoutMs resolver:resolve rejecter:reject];
}

// Required implementation for Turbo Native Module
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeSherloModuleSpecJSI>(params);
}
#endif
#endif

@end 