#import "SherloModule.h"
#import <React/RCTUtils.h>
#import <React/RCTUIManagerUtils.h>
#import <React/RCTBridge.h>
#import "SherloModuleCore.h"

@implementation SherloModule

RCT_EXPORT_MODULE(SherloModule)

@synthesize bridge = _bridge;

static SherloModuleCore *core;

// This runs automatically when the dynamic library is loaded
__attribute__((constructor))
static void SherloEarlyInit(void) {
  core = [[SherloModuleCore alloc] init];
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

#ifdef RCT_NEW_ARCH_ENABLED // ------------------- NEW ARCH -------------------

/**
 * Returns the Sherlo constants.
 */
- (NSDictionary *)getSherloConstants {
    return [core getSherloConstants];
}

/**
 * Toggles between Storybook and default modes.
 */
- (void)toggleStorybook
{ 
  [core toggleStorybook:self.bridge];
}

/**
 * Explicitly switches to Storybook mode.
 */
- (void)openStorybook
{
  [core openStorybook:self.bridge];
}

/**
 * Explicitly switches to default mode.
 */
- (void)closeStorybook
{
  [core closeStorybook:self.bridge];
}

/**
 * Appends base64 encoded content to a file.
 */
- (void)appendFile:(NSString *)path
          content:(NSString *)content
          resolve:(RCTPromiseResolveBlock)resolve
           reject:(RCTPromiseRejectBlock)reject
{
  [core appendFile:path withContent:content resolve:resolve reject:reject];
}

/**
 * Reads a file and returns its contents as base64 encoded string.
 */
- (void)readFile:(NSString *)path
        resolve:(RCTPromiseResolveBlock)resolve
         reject:(RCTPromiseRejectBlock)reject
{
  [core readFile:path resolve:resolve reject:reject];
}

/**
 * Gets UI inspector data from the current view hierarchy.
 */
- (void)getInspectorData:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject
{
  [core getInspectorData:resolve reject:reject];
}

/**
 * Checks UI stability by comparing screenshots taken over a specified interval.
 * The saveScreenshots parameter is accepted for cross-platform compatibility but not used in iOS.
 */
- (void)stabilize:(NSInteger)requiredMatches
        minScreenshotsCount:(NSInteger)minScreenshotsCount
       intervalMs:(NSInteger)intervalMs
        timeoutMs:(NSInteger)timeoutMs
  saveScreenshots:(BOOL)saveScreenshots
         resolve:(RCTPromiseResolveBlock)resolve
          reject:(RCTPromiseRejectBlock)reject
{
  [core stabilize:requiredMatches minScreenshotsCount:minScreenshotsCount intervalMs:intervalMs timeoutMs:timeoutMs resolve:resolve reject:reject];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeSherloModuleSpecJSI>(params);
}

#else // ------------------- OLD ARCH -------------------

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
  [core appendFile:path withContent:content resolve:resolve reject:reject];
}

/**
 * Reads a file and returns its contents as base64 encoded string.
 */
RCT_EXPORT_METHOD(readFile:(NSString *)path
                  resolve:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject) {
  [core readFile:path resolve:resolve reject:reject];
}

/**
 * Gets UI inspector data from the current view hierarchy.
 */
RCT_EXPORT_METHOD(getInspectorData:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
  [core getInspectorData:resolve reject:reject];
}

/**
 * Checks UI stability by comparing screenshots taken over a specified interval.
 * The saveScreenshots parameter is accepted for cross-platform compatibility but not used in iOS.
 */
RCT_EXPORT_METHOD(stabilize:(NSInteger)requiredMatches
                  minScreenshotsCount:(NSInteger)minScreenshotsCount
                 intervalMs:(NSInteger)intervalMs
                  timeoutMs:(NSInteger)timeoutMs
                  saveScreenshots:(BOOL)saveScreenshots
                   resolver:(RCTPromiseResolveBlock)resolve
                   rejecter:(RCTPromiseRejectBlock)reject) {
  [core stabilize:requiredMatches minScreenshotsCount:minScreenshotsCount intervalMs:intervalMs timeoutMs:timeoutMs resolve:resolve reject:reject];
}

#endif

@end