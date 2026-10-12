#import "SherloModule.h"
#import <React/RCTUtils.h>
#import <React/RCTUIManagerUtils.h>
#import <React/RCTBridge.h>
#import "SherloModuleCore.h"
#import "SherloIOSExceptionHandler.h"

@implementation SherloModule

RCT_EXPORT_MODULE(SherloModule)

static SherloModuleCore *core;

/** The module whose JavaScript listens for the connection's messages now, if any. */
static __weak SherloModule *listeningModule = nil;

// This runs automatically when the dynamic library is loaded
__attribute__((constructor))
static void SherloEarlyInit(void) {
  [SherloModuleCore setMessageReceiver:^(NSString *messageJson) {
    [listeningModule sendEventWithName:SHERLO_MESSAGE_EVENT body:messageJson];
  }];
  core = [[SherloModuleCore alloc] init];
  if ([[SherloModuleCore currentMode] isEqualToString:@"testing"]) {
    [SherloIOSExceptionHandler install];
  }
}

/**
 * One module is made for each start of the JavaScript.
 */
- (instancetype)init {
  self = [super init];
  [SherloIOSExceptionHandler javaScriptStarted];
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

- (NSArray<NSString *> *)supportedEvents {
  return @[ SHERLO_MESSAGE_EVENT ];
}

/** The JavaScript started listening for the connection's messages. */
- (void)startObserving {
  listeningModule = self;
}

/** The JavaScript stopped listening; a newer start's module may listen already. */
- (void)stopObserving {
  if (listeningModule == self) listeningModule = nil;
}

#ifdef RCT_NEW_ARCH_ENABLED // ------------------- NEW ARCH -------------------

/**
 * The sealed JS core native code picked, as JSON. Synchronous: JavaScript evaluates it on import.
 */
- (NSString *)loadCore {
  return [core loadCore];
}

/**
 * Sends one message over the app's connection.
 */
- (void)sendMessage:(NSString *)messageJson {
  [core sendMessage:messageJson];
}

/**
 * Opens the connection to the bundler's Sherlo address, unless one is open.
 */
- (void)dialBundler:(NSString *)address {
  [core dialBundler:address];
}

/**
 * The memory the app's process uses, in MB.
 */
- (void)getMemoryMb:(RCTPromiseResolveBlock)resolve
             reject:(RCTPromiseRejectBlock)reject
{
  [core getMemoryMb:resolve reject:reject];
}

/**
 * Starts the app's JavaScript again in the same process.
 */
- (void)reloadJavaScript {
  [core reloadJavaScript];
}

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
 * Explicitly switches to testing mode.
 */
- (void)openTesting:(NSString *)storyId config:(NSString *)config
{
  [core openTesting:self.bridge storyId:storyId configJson:config];
}

/**
 * Sends a NATIVE_ERROR over the app's connection.
 */
- (void)sendNativeError:(NSString *)errorCode
                message:(NSString *)message
               dataJson:(NSString *)dataJson
{
  [core sendNativeError:errorCode message:message dataJson:dataJson];
}

/**
 * Sends a JS_ERROR for module-eval errors caught by the __r polyfill, and waits until the socket
 * took it. Must not throw - called from a polyfill catch block.
 */
- (NSNumber *)reportEarlyJsError:(NSString *)name
                         message:(NSString *)message
                           stack:(NSString *)stack
{
  return [core reportEarlyJsError:name message:message stack:stack] ? @YES : @NO;
}

/**
 * Refuses: the app keeps no Sherlo file.
 */
- (void)appendFile:(NSString *)path
          content:(NSString *)content
          resolve:(RCTPromiseResolveBlock)resolve
           reject:(RCTPromiseRejectBlock)reject
{
  [core appendFile:path withContent:content resolve:resolve reject:reject];
}

/**
 * Refuses: the app keeps no Sherlo file.
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
 */
- (void)stabilize:(double)requiredMatches
        minScreenshotsCount:(double)minScreenshotsCount
       intervalMs:(double)intervalMs
        timeoutMs:(double)timeoutMs
  saveScreenshots:(BOOL)saveScreenshots
        threshold:(double)threshold
        includeAA:(BOOL)includeAA
         resolve:(RCTPromiseResolveBlock)resolve
          reject:(RCTPromiseRejectBlock)reject
{
  [core stabilize:(NSInteger)requiredMatches minScreenshotsCount:(NSInteger)minScreenshotsCount intervalMs:(NSInteger)intervalMs timeoutMs:(NSInteger)timeoutMs saveScreenshots:saveScreenshots threshold:threshold includeAA:includeAA resolve:resolve reject:reject];
}

/**
 * Native paint barrier: resolves on the next real display frame.
 */
- (void)awaitFrameCommit:(double)timeoutMs
                 resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject
{
  [core awaitFrameCommit:timeoutMs resolve:resolve reject:reject];
}

/**
 * Detects if the currently visible screen can be vertically scrolled for long-screenshot capture.
 */
- (void)isScrollable:(RCTPromiseResolveBlock)resolve
                      reject:(RCTPromiseRejectBlock)reject
{
  [core isScrollable:resolve reject:reject];
}

/**
 * Deterministically scrolls to a checkpoint index.
 */
- (void)scrollToCheckpoint:(double)index
                    offset:(double)offset
                  maxIndex:(double)maxIndex
                   resolve:(RCTPromiseResolveBlock)resolve
                    reject:(RCTPromiseRejectBlock)reject
{
  [core scrollToCheckpoint:index offset:offset maxIndex:maxIndex resolve:resolve reject:reject];
}

/**
 * Cancel signal for the native NOT_DISPLAYED watchdog timer.
 * Called from JS getStorybook() synchronously to indicate Storybook is being used.
 */
- (void)notifyGetStorybookCalled {
  [SherloModuleCore setGetStorybookCalled];
  [SherloModuleCore cancelStorybookNotDisplayedTimer];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeSherloModuleSpecJSI>(params);
}

#else // ------------------- OLD ARCH -------------------

/**
 * The sealed JS core native code picked, as JSON. Synchronous: JavaScript evaluates it on import.
 */
RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(loadCore) {
  return [core loadCore];
}

/**
 * Sends one message over the app's connection.
 */
RCT_EXPORT_METHOD(sendMessage:(NSString *)messageJson) {
  [core sendMessage:messageJson];
}

/**
 * Opens the connection to the bundler's Sherlo address, unless one is open.
 */
RCT_EXPORT_METHOD(dialBundler:(NSString *)address) {
  [core dialBundler:address];
}

/**
 * The memory the app's process uses, in MB.
 */
RCT_EXPORT_METHOD(getMemoryMb:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
  [core getMemoryMb:resolve reject:reject];
}

/**
 * Starts the app's JavaScript again in the same process.
 */
RCT_EXPORT_METHOD(reloadJavaScript) {
  [core reloadJavaScript];
}

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
 * Explicitly switches to testing mode.
 */
RCT_EXPORT_METHOD(openTesting:(NSString *)storyId
                  config:(NSString *)config) {
  [core openTesting:self.bridge storyId:storyId configJson:config];
}

/**
 * Sends a NATIVE_ERROR over the app's connection.
 */
RCT_EXPORT_METHOD(sendNativeError:(NSString *)errorCode
                  message:(NSString *)message
                  dataJson:(NSString *)dataJson) {
  [core sendNativeError:errorCode message:message dataJson:dataJson];
}

/**
 * Sends a JS_ERROR for module-eval errors caught by the __r polyfill, and waits until the socket
 * took it.
 */
RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(reportEarlyJsError:(NSString *)name
                                       message:(NSString *)message
                                         stack:(NSString *)stack) {
  return [core reportEarlyJsError:name message:message stack:stack] ? @YES : @NO;
}

/**
 * Refuses: the app keeps no Sherlo file.
 */
RCT_EXPORT_METHOD(appendFile:(NSString *)path
                  withContent:(NSString *)content
                     resolver:(RCTPromiseResolveBlock)resolve
                     rejecter:(RCTPromiseRejectBlock)reject) {
  [core appendFile:path withContent:content resolve:resolve reject:reject];
}

/**
 * Refuses: the app keeps no Sherlo file.
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
 */
RCT_EXPORT_METHOD(stabilize:(double)requiredMatches
                  minScreenshotsCount:(double)minScreenshotsCount
                 intervalMs:(double)intervalMs
                  timeoutMs:(double)timeoutMs
                  saveScreenshots:(BOOL)saveScreenshots
                  threshold:(double)threshold
                  includeAA:(BOOL)includeAA
                   resolve:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject) {
  [core stabilize:(NSInteger)requiredMatches minScreenshotsCount:(NSInteger)minScreenshotsCount intervalMs:(NSInteger)intervalMs timeoutMs:(NSInteger)timeoutMs saveScreenshots:saveScreenshots threshold:threshold includeAA:includeAA resolve:resolve reject:reject];
}

/**
 * Native paint barrier: resolves on the next real display frame.
 */
RCT_EXPORT_METHOD(awaitFrameCommit:(double)timeoutMs
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
  [core awaitFrameCommit:timeoutMs resolve:resolve reject:reject];
}

/**
 * Detects if the currently visible screen can be vertically scrolled for long-screenshot capture.
 */
RCT_EXPORT_METHOD(isScrollable:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
  [core isScrollable:resolve reject:reject];
}

/**
 * Deterministically scrolls to a checkpoint index.
 */
RCT_EXPORT_METHOD(scrollToCheckpoint:(double)index
                  offset:(double)offset
                  maxIndex:(double)maxIndex
                   resolve:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject) {
  [core scrollToCheckpoint:index offset:offset maxIndex:maxIndex resolve:resolve reject:reject];
}

/**
 * Cancel signal for the native NOT_DISPLAYED watchdog timer.
 * Called from JS getStorybook() synchronously to indicate Storybook is being used.
 */
RCT_EXPORT_METHOD(notifyGetStorybookCalled) {
  [SherloModuleCore setGetStorybookCalled];
  [SherloModuleCore cancelStorybookNotDisplayedTimer];
}

#endif

@end
