#import "SherloModule.h"
#import "FileSystemHelper.h"
#import "InspectorHelper.h"
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

static NSString *CONFIG_FILENAME = @"config.sherlo";
static NSString *const LOG_TAG = @"SherloModule";

static NSString *syncDirectoryPath = @"";
static NSString *mode = @"default"; // "default" / "storybook" / "testing"
static NSString *originalComponentName;
static BOOL isStorybookRegistered = NO;
static int expoUpdateDeeplinkConsumeCount = 0;

@implementation SherloModule

RCT_EXPORT_MODULE()

@synthesize bridge = _bridge;

// Initializes the Sherlo module, sets up necessary directory paths, and checks if testing mode is required.
// If a configuration file exists, the module sets up the application in testing mode and presents the Storybook view.
// Exceptions are caught and logged.
- (instancetype)init {
  self = [super init];
  if (self) {
    @try {
      NSLog(@"[%@] Initializing SherloModule", LOG_TAG);

      // Set Sherlo directory path, this is the directory that will be 
      // used to sync files between the emulator and Sherlo Runner
      NSArray *paths = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
      NSString *documentsPath = [paths firstObject];
      if (!documentsPath) {
        NSLog(@"[%@] Error: Failed to get the documents directory path.", LOG_TAG);
        return nil;
      }

      syncDirectoryPath = [documentsPath stringByAppendingPathComponent:@"sherlo"];
      if (!syncDirectoryPath) {
        NSLog(@"[%@] Error: Failed to set the Sherlo directory path.", LOG_TAG);
        return nil;
      }

      // This is the path to the config file created by the Sherlo Runner
      NSString *configPath = [syncDirectoryPath stringByAppendingPathComponent:CONFIG_FILENAME];
      if (!configPath) {
        NSLog(@"[%@] Error: Failed to set the config file path.", LOG_TAG);
        return nil;
      }
      
      BOOL doesSherloConfigFileExist = [[NSFileManager defaultManager] fileExistsAtPath:configPath];
      if (doesSherloConfigFileExist) {
        NSError *error = nil;
        NSString *configContent = [NSString stringWithContentsOfFile:configPath encoding:NSUTF8StringEncoding error:&error];

        if (error) {
          NSLog(@"[%@] Error reading config file: %@", LOG_TAG, error.localizedDescription);
          [self writeErrorToFile:@"ERROR_READING_CONFIG_FILE"];
        } else {
          NSData *jsonData = [configContent dataUsingEncoding:NSUTF8StringEncoding];
          NSDictionary *jsonDict = [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:&error];

          if (error) {
            NSLog(@"[%@] Error parsing JSON: %@", LOG_TAG, error.localizedDescription);
            [self writeErrorToFile:@"ERROR_PARSING_JSON"];
          } else {
            NSString *expoUpdateDeeplink = jsonDict[@"expoUpdateDeeplink"];
            // If the expoUpdateDeeplink is present in the config, we will open the url twice to make sure
            // the app is restarted with new update bundle and second time to make sure we dismiss the
            // initial expo dev client modal
            if (expoUpdateDeeplink) {
              // If app is not built with expo-dev-client, log error and continue
              if (![self checkIfExpoDevClient]) {
                NSLog(@"[%@] Error: App is not built with expo-dev-client", LOG_TAG);
                [self writeErrorToFile:@"ERROR_EXPO_DEV_CLIENT"];
                return nil;
              }

              NSLog(@"[%@] Consuming expo update deeplink", LOG_TAG);

              if (expoUpdateDeeplinkConsumeCount < 2) {
                dispatch_async(dispatch_get_main_queue(), ^{
                  NSURL *nsurl = [NSURL URLWithString:expoUpdateDeeplink];

                  if ([[UIApplication sharedApplication] canOpenURL:nsurl]) {
                    [[UIApplication sharedApplication] openURL:nsurl options:@{} completionHandler:nil];
                    expoUpdateDeeplinkConsumeCount++; // Increment the counter after opening the URL

                    NSLog(@"[%@] URL consumed %d time(s)", LOG_TAG, expoUpdateDeeplinkConsumeCount);
                  } else {
                    NSLog(@"[%@] Cannot open URL: %@", LOG_TAG, expoUpdateDeeplink);
                    [self writeErrorToFile:@"ERROR_OPENING_URL"];
                  }
                });
              } else {
                // After the URL has been consumed twice, we are in testing mode
                mode = @"testing";
              }
            } else {
              // If the expoUpdateDeeplink is not present in the config, we are immidiately in testing mode
              mode = @"testing";
            }
          }
        }
      }
    } @catch (NSException *exception) {
      NSLog(@"[%@] Exception occurred: %@, %@", LOG_TAG, exception.reason, exception.userInfo);
      [self writeErrorToFile:@"ERROR_MODULE_INIT_EXCEPTION"];
      return nil;
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
  return @{
    @"syncDirectoryPath": syncDirectoryPath,
    @"mode": mode
  };
}

// Toggles the Storybook view. If the Storybook is currently open, it closes it. Otherwise, it opens it.
// Exceptions during the toggle are caught and handled.
RCT_EXPORT_METHOD(toggleStorybook:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  if ([mode isEqualToString:@"storybook"]) {
    [self closeStorybook:resolve rejecter:reject];
  } else {
    [self openStorybook:resolve rejecter:reject];
  }
}

- (BOOL)checkIfExpoDevClient {
    // Check for Expo Dev Client-specific classes
    Class devMenuClass = NSClassFromString(@"EXDevMenu");
    if (devMenuClass) {
        return YES;
    }
    return NO;
}

// Opens the Storybook view in a separate view controller on top of the root view controller,
// allowing the user to return to the same app state after closing the Storybook.
// Exceptions during the opening process are caught and handled.
RCT_EXPORT_METHOD(openStorybook:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  mode = @"storybook";
  
  [RestartHelper reloadWithBridge:self.bridge];
  resolve(nil);
}

// Internal method to handle closing the Storybook view. This method is executed on the main queue.
// If any errors occur during the closing process, they are caught and the reject block is called with the appropriate error message.
RCT_EXPORT_METHOD(closeStorybook:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  mode = @"default";
  
  [RestartHelper reloadWithBridge:self.bridge];
  resolve(nil);
}

// Creates a directory at the specified filepath.
// If the directory creation fails, the reject block is called with an appropriate error message.
RCT_EXPORT_METHOD(mkdir:(NSString *)filepath resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  NSError *error = [FileSystemHelper mkdir:filepath];
  
  if (error) {
    reject(@"E_MKDIR", [NSString stringWithFormat:@"Failed to create directory at path %@", filepath], error);
  } else {
    resolve(nil);
  }
}

// Appends a base64 encoded file to the specified filepath.
// If the file does not exist, it creates a new file.
// If any errors occur during the append process, the reject block is called with an appropriate error message.
RCT_EXPORT_METHOD(appendFile:(NSString *)filepath contents:(NSString *)base64Content resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  @try {
    NSError *error = [FileSystemHelper appendFile:filepath contents:base64Content];
    
    if (error) {
      reject(@"E_APPENDFILE", [NSString stringWithFormat:@"Failed to append to file at path %@", filepath], error);
    } else {
      resolve(nil);
    }
  } @catch (NSException *exception) {
    [self handleException:exception rejecter:reject];
  }
}

// Reads a byte array from the specified file and returns it as a base64 string.
// If the file does not exist or if any errors occur during the read process, the reject block is called with an appropriate error message.
RCT_EXPORT_METHOD(readFile:(NSString *)filepath resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  @try {
    NSError *error = nil;
    NSString *base64Content = [FileSystemHelper readFile:filepath error:&error];
    
    if (error) {
      reject(@"E_READFILE", [NSString stringWithFormat:@"Failed to read file at path %@", filepath], error);
    } else if (!base64Content) {
      reject(@"E_READFILE", @"File content is empty or could not be encoded to base64", nil);
    } else {
      resolve(base64Content);
    }
  } @catch (NSException *exception) {
    [self handleException:exception rejecter:reject];
  }
}

RCT_EXPORT_METHOD(dumpBoundries:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    UIWindow *keyWindow = [UIApplication sharedApplication].keyWindow;
    if (!keyWindow) {
      reject(@"no_key_window", @"Could not find the key window", nil);
      return;
    }

    UIView *rootView = keyWindow.rootViewController.view;
    if (!rootView) {
      reject(@"no_root_view", @"Could not find the root view", nil);
      return;
    }

    NSError *error = nil;
    NSString *jsonString = [InspectorHelper dumpBoundaries:rootView error:&error];
    if (error) {
      reject(@"json_error", @"Could not serialize view data to JSON", error);
    } else if (!jsonString) {
      reject(@"string_error", @"Could not convert JSON data to string", nil);
    } else {
      resolve(jsonString);
    }
  });
}

- (NSString *)getSyncDirectoryPath
{
  // Use the app's documents directory
  NSArray<NSString *> *paths = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
  return [paths firstObject];
}

// Handles exceptions by logging the error and rejecting the promise with an appropriate error message.
- (void)handleException:(NSException *)exception rejecter:(RCTPromiseRejectBlock)reject {
  NSMutableDictionary *info = [NSMutableDictionary dictionary];
  [info setValue:exception.name forKey:@"ExceptionName"];
  [info setValue:exception.reason forKey:@"ExceptionReason"];

  NSError *error = [NSError errorWithDomain:@"SherloModule" code:0 userInfo:info];
  reject(@"E_EXCEPTION", @"Exception occurred", error);
}

// A function that writes an error code to error.sherlo file in sync directory
- (void)writeErrorToFile:(NSString *)errorCode {
  NSString *errorFilePath = [syncDirectoryPath stringByAppendingPathComponent:@"error.sherlo"];
  [FileSystemHelper writeFile:errorFilePath contents:errorCode];
}

@end
