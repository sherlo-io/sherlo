#import "SherloModule.h"

@synthesize bridge = _bridge;

static SherloModuleCore *core;

#ifdef RCT_NEW_ARCH_ENABLED

- (NSDictionary *)getSherloConstants {
    return [core getSherloConstants];
}

- (void)toggleStorybook
{
  [core toggleStorybook:self.bridge];
}

- (void)openStorybook
{
  [core openStorybook:self.bridge];
}

- (void)closeStorybook
{
  [core closeStorybook:self.bridge];
}

- (void)appendFile:(NSString *)path
      withContent:(NSString *)content
         resolver:(RCTPromiseResolveBlock)resolve
         rejecter:(RCTPromiseRejectBlock)reject
{
  [core appendFile:path withContent:content resolver:resolve rejecter:reject];
}

- (void)readFile:(NSString *)path
        resolver:(RCTPromiseResolveBlock)resolve
        rejecter:(RCTPromiseRejectBlock)reject
{
  [core readFile:path resolver:resolve rejecter:reject];
}

- (void)getInspectorData:(RCTPromiseResolveBlock)resolve
                rejecter:(RCTPromiseRejectBlock)reject
{
  [core getInspectorData:resolve rejecter:reject];
}

- (void)stabilize:(NSInteger)requiredMatches
       intervalMs:(NSInteger)intervalMs
        timeoutMs:(NSInteger)timeoutMs
  saveScreenshots:(BOOL)saveScreenshots
         resolver:(RCTPromiseResolveBlock)resolve
         rejecter:(RCTPromiseRejectBlock)reject
{
  [core stabilize:requiredMatches intervalMs:intervalMs timeoutMs:timeoutMs resolver:resolve rejecter:reject];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeSherloModuleSpecJSI>(params);
}

#else

#import <React/RCTUtils.h>
#import <React/RCTUIManagerUtils.h>
#import <React/RCTBridge.h>

@implementation SherloModule

RCT_EXPORT_MODULE(SherloModule)

/**
 * Required method to initialize the module.
 * Creates the core instance and initializes it.
 */
- (instancetype)init {
    self = [super init];
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

@end

#endif