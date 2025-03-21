#import "SherloModule.h"
#import "FileSystemHelper.h"
#import "InspectorHelper.h"
#import "RestartHelper.h"
#import "ConfigHelper.h"
#import "ExpoUpdateHelper.h"
#import "StableUIChecker.h"
#import "VerificationHelper.h"
#import "ErrorHelper.h"
#import "ModeHelper.h"
#import "KeyboardHelper.h"
#import "ModuleInitHelper.h"
#import "LastStateHelper.h"

// Only keep the StorybookMethodHandler
#import "StorybookMethodHandler.h"

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

#import <React/RCTUtils.h>
#import <React/RCTUIManager.h>
#import <React/RCTBridge.h>
#import <React/RCTRootView.h>
#import <React/RCTBundleURLProvider.h>

// A safeguard to ensure compatibility with different versions of React Native
#if __has_include(<React/RCTUIManagerUtils.h>)
// These are necessary for any interactions with the React Native UI Manager 
// (e.g., operations on RCTRootView).
#import <React/RCTUIManagerUtils.h>
#endif

#import <objc/runtime.h>

static NSString *syncDirectoryPath = @"";
static NSDictionary *config = nil;
static NSDictionary *lastState = nil;

@interface SherloModule()

@property (nonatomic, strong) ErrorHelper *errorHelper;
@property (nonatomic, strong) StorybookMethodHandler *storybookHandler;
@property (nonatomic, strong) FileSystemHelper *fileSystemHelper;
@property (nonatomic, strong) InspectorHelper *inspectorHelper;
@property (nonatomic, strong) LastStateHelper *lastStateHelper;

@end

@implementation SherloModule

RCT_EXPORT_MODULE()

@synthesize bridge = _bridge;

- (instancetype)init {
  self = [super init];
  if (self) {
    void (^errorHandler)(NSString *, id) = ^(NSString *errorCode, id error) {
      [ErrorHelper handleError:errorCode error:error syncDirectoryPath:syncDirectoryPath];
    };
    
    NSString *initMode = @"default";
    NSString *newSyncDirectoryPath = @"";
    NSString *newMode = @"default";
    NSDictionary *newConfig = nil;
    
    [ModuleInitHelper initialize:&newSyncDirectoryPath modeRef:&newMode configRef:&newConfig errorHandler:errorHandler];
    
    syncDirectoryPath = [newSyncDirectoryPath copy];
    config = [newConfig copy];
    [ModeHelper setMode:newMode];
    
    // Initialize our handlers
    self.errorHelper = [[ErrorHelper alloc] init];
    self.fileSystemHelper = [[FileSystemHelper alloc] initWithErrorHelper:self.errorHelper
                                                        syncDirectoryPath:syncDirectoryPath];
    self.inspectorHelper = [[InspectorHelper alloc] initWithErrorHelper:self.errorHelper];
    self.lastStateHelper = [[LastStateHelper alloc] initWithFileSystemHelper:self.fileSystemHelper
                                                                errorHelper:self.errorHelper
                                                           syncDirectoryPath:syncDirectoryPath];
    
    // Get the last state
    lastState = [self.lastStateHelper getLastState];
    
    // Initialize StorybookMethodHandler
    self.storybookHandler = [[StorybookMethodHandler alloc] initWithBridge:self.bridge
                                                               errorHelper:self.errorHelper
                                                          syncDirectoryPath:syncDirectoryPath];
  }
  
  return self;
}

// Indicates whether the module needs to be initialized on the main thread.
// This is necessary for modules that interact with the UI or need to perform any setup that affects the UI.
+ (BOOL)requiresMainQueueSetup {
  return YES;
}

// Specifies the dispatch queue on which the module's methods should be executed.
// This ensures that UI updates from native modules are thread-safe and responsive.
- (dispatch_queue_t)methodQueue {
  return RCTGetUIManagerQueue();
}

// Exports constants to JavaScript. In this case, it exports the sync directory path and initial mode.
- (NSDictionary *)constantsToExport {
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
    @"syncDirectoryPath": syncDirectoryPath,
    @"mode": [ModeHelper currentMode],
    @"config": configString ?: [NSNull null],
    @"lastState": lastStateString ?: [NSNull null]
  };
}

// Verifies the integration with the Sherlo SDK.
// It sets the mode to "verification" and reloads the bridge which should load the storybook in verification mode
// If we cannot detect sherlo wrapper view that means that the integration is not correct
// and user will be presented with error modal, if it's triggered in testing mode the error will be written to error.sherlo
RCT_EXPORT_METHOD(verifyIntegration:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  [self.storybookHandler verifyIntegrationWithResolver:resolve rejecter:reject];
}

// Toggles the mode between "storybook" and "default"
RCT_EXPORT_METHOD(toggleStorybook:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  [self.storybookHandler toggleStorybookWithResolver:resolve rejecter:reject];
}

// Switches the mode to "storybook" and reloads the bridge
RCT_EXPORT_METHOD(openStorybook:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  [self.storybookHandler openStorybookWithResolver:resolve rejecter:reject];
}

// Switches the mode to "default" and reloads the bridge
RCT_EXPORT_METHOD(closeStorybook:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  [self.storybookHandler closeStorybookWithResolver:resolve rejecter:reject];
}

// Creates a directory at the specified filepath.
// If the directory creation fails, the reject block is called with an appropriate error message.
RCT_EXPORT_METHOD(mkdir:(NSString *)filepath resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  [self.fileSystemHelper mkdirWithPath:filepath resolver:resolve rejecter:reject];
}

RCT_EXPORT_METHOD(checkIfStable:(NSInteger)requiredMatches
                  interval:(NSInteger)intervalMs
                  timeout:(NSInteger)timeoutMs
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  [self.inspectorHelper checkIfStableWithRequiredMatches:requiredMatches
                                              intervalMs:intervalMs
                                               timeoutMs:timeoutMs
                                                resolver:resolve
                                                rejecter:reject];
}

// Appends a base64 encoded file to the specified filepath.
// If the file does not exist, it creates a new file.
// If any errors occur during the append process, the reject block is called with an appropriate error message.
RCT_EXPORT_METHOD(appendFile:(NSString *)filepath contents:(NSString *)base64Content resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  [self.fileSystemHelper appendFileWithPath:filepath base64Content:base64Content resolver:resolve rejecter:reject];
}

// Reads a byte array from the specified file and returns it as a base64 string.
// If the file does not exist or if any errors occur during the read process, the reject block is called with an appropriate error message.
RCT_EXPORT_METHOD(readFile:(NSString *)filepath resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  [self.fileSystemHelper readFileWithPath:filepath resolver:resolve rejecter:reject];
}

// Dumps the boundaries of the root view as a JSON string.
// If any errors occur during the dump process, the reject block is called with an appropriate error message.
RCT_EXPORT_METHOD(getInspectorData:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  [self.inspectorHelper getInspectorDataWithResolver:resolve rejecter:reject];
}

@end
