#import "SherloModule.h"
#import "FileSystemHelper.h"
#import "InspectorHelper.h"
#import "ConfigHelper.h"
#import "ExpoUpdateHelper.h"
#import "StableUIChecker.h"
#import "ErrorHelper.h"
#import "KeyboardHelper.h"
#import "LastStateHelper.h"
#import "RestartHelper.h"

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
static NSString *mode = @"default"; // "default" / "storybook" / "testing"


@interface SherloModule()

@property (nonatomic, strong) ErrorHelper *errorHelper;
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
    
    // Get sync directory path
    NSError *getSyncDirectoryPathError = nil;
    syncDirectoryPath = [ConfigHelper getSyncDirectoryPath:&getSyncDirectoryPathError];
    if (getSyncDirectoryPathError) {
      errorHandler(@"ERROR_MODULE_INIT", getSyncDirectoryPathError);
      return self;
    }
    
    // Load config
    NSError *loadConfigError = nil;
    config = [ConfigHelper loadConfig:&loadConfigError syncDirectoryPath:syncDirectoryPath];
    if (loadConfigError) {
      errorHandler(@"ERROR_MODULE_INIT", loadConfigError);
      return self;
    }
    
    // Check for Expo update deeplink if config exists
    if (config) {
      NSLog(@"[SherloModule] Config exists");

      NSString *overrideMode = config[@"overrideMode"];
      if (overrideMode) {
        mode = overrideMode;
      } else {
        mode = @"testing";
      }

      NSLog(@"[SherloModule] Mode: %@", mode);
    }
    

    if ([mode isEqualToString:@"testing"]) {
      [KeyboardHelper setupKeyboardSwizzling];

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


      // Check for Expo update deeplink if config exists
      NSString *expoUpdateDeeplink = config[@"expoUpdateDeeplink"];
      
      if (expoUpdateDeeplink) {
        
        BOOL wasDeeplinkConsumed = [ExpoUpdateHelper wasDeeplinkConsumed];

        // If last state is present we don't need to consume the deeplink
        // because expo dev client already points to the correct expo update
        BOOL lastStateHasNextSnapshotIndex = lastState[@"nextSnapshotIndex"] != nil;

        if(!wasDeeplinkConsumed && !lastStateHasNextSnapshotIndex) {
          NSLog(@"[SherloModule] Consuming expo update deeplink");

          NSError *expoUpdateError = nil;
          [ExpoUpdateHelper consumeExpoUpdateDeeplink:expoUpdateDeeplink error:&expoUpdateError];
        
          if (expoUpdateError) {
            errorHandler(@"ERROR_OPENING_EXPO_DEEPLINK", expoUpdateError);
          }

          return self;
        }
      }
    }
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
    @"mode": mode,
    @"config": configString ?: [NSNull null],
    @"lastState": lastStateString ?: [NSNull null]
  };
}

// Toggles the mode between "storybook" and "default"
RCT_EXPORT_METHOD(toggleStorybook:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
    if ([mode isEqualToString:@"storybook"]) {
        // Switch to default mode
        mode = @"default";
        [RestartHelper reloadWithBridge:_bridge];
    } else {
        // Switch to storybook mode
        mode = @"storybook";
        [RestartHelper reloadWithBridge:_bridge];
    }

    resolve(nil);
}

// Switches the mode to "storybook" and reloads the bridge
RCT_EXPORT_METHOD(openStorybook:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  mode = @"storybook";
  [RestartHelper reloadWithBridge:_bridge];
  resolve(nil);
}

// Switches the mode to "default" and reloads the bridge
RCT_EXPORT_METHOD(closeStorybook:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
    mode = @"default";
    [RestartHelper reloadWithBridge:_bridge];
    resolve(nil);
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
