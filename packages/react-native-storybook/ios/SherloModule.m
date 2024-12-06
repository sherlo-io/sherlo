#import "SherloModule.h"
#import "FileSystemHelper.h"
#import "InspectorHelper.h"
#import "RestartHelper.h"
#import "ConfigHelper.h"
#import "ExpoUpdateHelper.h"
#import "VerificationHelper.h"
#import "StorybookErrorHelper.h"

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

static NSString *PROTOCOL_FILENAME = @"protocol.sherlo";
static NSString *const LOG_TAG = @"SherloModule";

static NSString *syncDirectoryPath = @"";
static NSString *mode = @"default"; // "default" / "storybook" / "testing" / "verification"

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

      NSError *getSyncDirectoryPathError = nil;
      syncDirectoryPath = [ConfigHelper getSyncDirectoryPath:&getSyncDirectoryPathError];
      if (getSyncDirectoryPathError) {
        [self handleError:@"ERROR_MODULE_INIT" error:getSyncDirectoryPathError];
        return self;
      }

      NSError *loadConfigError = nil;
      NSDictionary *config = [ConfigHelper loadConfig:&loadConfigError syncDirectoryPath:syncDirectoryPath];
      if (loadConfigError) {
        [self handleError:@"ERROR_MODULE_INIT" error:loadConfigError];
        return self;
      }
      
      // if there's a config, we are in testing mode
      if(config) {
        NSString *overrideMode = config[@"overrideMode"];
        if (overrideMode) {
          mode = overrideMode;
          return self;
        }

        NSString *expoUpdateDeeplink = config[@"expoUpdateDeeplink"];
        
        if (expoUpdateDeeplink) {
          NSLog(@"[%@] Consuming expo update deeplink", LOG_TAG);

          NSError *expoUpdateError = nil;
          NSString *tempMode = mode;
          // This function will set the mode to "testing" if it consumes the expo update deeplink
          [ExpoUpdateHelper consumeExpoUpdateDeeplink:expoUpdateDeeplink modeRef:&tempMode error:&expoUpdateError];
          mode = tempMode;

          if ([mode isEqualToString:@"testing"]) {
            [self setupKeyboardSwizzling];
          }
          
          if (expoUpdateError) {
            [self handleError:@"ERROR_OPENING_EXPO_DEEPLINK" error:expoUpdateError];
          }
        } else {
          [self setupKeyboardSwizzling];
          // If the expoUpdateDeeplink is not present in the config, we are immediately in testing mode
          mode = @"testing";
        }
      }
    } @catch (NSException *exception) {
      [self handleError:@"ERROR_MODULE_INIT" error:exception.reason];
      return self;
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

// Verifies the integration with the Sherlo SDK.
// It sets the mode to "verification" and reloads the bridge which should load the storybook in verification mode
// If we cannot detect sherlo wrapper view that means that the integration is not correct
// and user will be presented with error modal, if it's triggered in testing mode the error will be written to error.sherlo
RCT_EXPORT_METHOD(verifyIntegration:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  NSLog(@"[%@] Verifying integration", LOG_TAG);
  // if(![mode isEqualToString:@"verification"]) {
    mode = @"verification";
    [RestartHelper reloadWithBridge:self.bridge];
    [self scheduleVerification];
  // }

  resolve(nil);
}

// Toggles the mode between "storybook" and "default"
RCT_EXPORT_METHOD(toggleStorybook:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  if ([mode isEqualToString:@"storybook"]) {
    [self closeStorybook:resolve rejecter:reject];
  } else {
    [self openStorybook:resolve rejecter:reject];
  }
}

// Switches the mode to "storybook" and reloads the bridge
RCT_EXPORT_METHOD(openStorybook:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  mode = @"storybook";
  
  [RestartHelper reloadWithBridge:self.bridge];
  resolve(nil);
}

// Switches the mode to "default" and reloads the bridge
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
  NSError *error = [FileSystemHelper appendFile:filepath contents:base64Content];
  
  if (error) {
    reject(@"E_APPENDFILE", [NSString stringWithFormat:@"Failed to append to file at path %@", filepath], error);
  } else {
    resolve(nil);
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
    [self handleError:@"ERROR_READ_FILE" error:exception.reason];
  }
}

// Dumps the boundaries of the root view as a JSON string.
// If any errors occur during the dump process, the reject block is called with an appropriate error message.
RCT_EXPORT_METHOD(getInspectorData:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    NSError *error = nil;
    NSString *jsonString = [InspectorHelper dumpBoundaries:&error];

    if (error) {
      reject(@"json_error", @"Could not serialize view data to JSON", error);
    } else {
      resolve(jsonString);
    }
  });
}

- (void)scheduleVerification {
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 1 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
    [VerificationHelper verifyIntegrationWithMode:mode syncDirectoryPath:syncDirectoryPath ];
  });
}

// A function that writes an error code to error.sherlo file in sync directory
- (void)handleError:(NSString *)errorCode error:(NSError *)error {
  NSLog(@"[%@] Error occurred: %@, Error: %@", LOG_TAG, errorCode, error.localizedDescription ?: @"N/A");

  NSString *protocolFilePath = [syncDirectoryPath stringByAppendingPathComponent:PROTOCOL_FILENAME];
  
  // Create the new JSON object with the specified properties
  NSMutableDictionary *nativeErrorDict = [@{
    @"action": @"NATIVE_ERROR",
    @"errorCode": errorCode,
    @"error": [NSString stringWithFormat:@"%@", error],
    @"timestamp": @((long long)([[NSDate date] timeIntervalSince1970] * 1000)),
    @"entity": @"app"
  } mutableCopy];

  // Convert the dictionary to JSON data
  NSError *jsonError;
  NSData *jsonData = [NSJSONSerialization dataWithJSONObject:nativeErrorDict options:0 error:&jsonError];
  
  if (jsonError) {
    NSLog(@"[%@] Error creating JSON: %@", LOG_TAG, jsonError.localizedDescription);
    return;
  }
  
  // Convert JSON data to base64 string
  NSString *base64ErrorData = [jsonData base64EncodedStringWithOptions:0];
  
  NSError *writeError = [FileSystemHelper appendFile:protocolFilePath contents:base64ErrorData];
  if (writeError) {
    NSLog(@"[%@] Error writing to error file: %@", LOG_TAG, writeError.localizedDescription);
  }
}

/**
 * Sets up keyboard prevention by swizzling (replacing) input-related methods.
 * 
 * What this does:
 * - Prevents keyboard from appearing for any input elements
 * - Prevents focus on text fields, text views, search bars, and webview inputs
 * - Removes keyboard accessory views
 * 
 * What this doesn't affect:
 * - Visual appearance of UI elements (colors, sizes, borders, etc.)
 * - Touch handling (elements can still be tapped)
 * - Any other UI behavior not related to keyboard/focus
 * 
 * This is used in testing mode to ensure keyboard doesn't interfere with UI testing.
 */
- (void)setupKeyboardSwizzling {
    // Swizzle UITextField
    Method textFieldMethod = class_getInstanceMethod([UITextField class], @selector(becomeFirstResponder));
    
    IMP newTextFieldImplementation = imp_implementationWithBlock(^BOOL(id _self) {
        return NO;
    });
    method_setImplementation(textFieldMethod, newTextFieldImplementation);
    
    // Swizzle UITextView
    Method textViewModel = class_getInstanceMethod([UITextView class], @selector(becomeFirstResponder));
    
    IMP newTextViewImplementation = imp_implementationWithBlock(^BOOL(id _self) {
        return NO;
    });
    method_setImplementation(textViewModel, newTextViewImplementation);
    
    // Additional input elements that can trigger keyboard
    Class searchBarClass = NSClassFromString(@"UISearchBar");
    if (searchBarClass) {
        Method searchBarMethod = class_getInstanceMethod(searchBarClass, @selector(becomeFirstResponder));
        method_setImplementation(searchBarMethod, newTextFieldImplementation);
    }

    // WebView input fields
    Class webViewClass = NSClassFromString(@"WKWebView");
    if (webViewClass) {
        Method webViewMethod = class_getInstanceMethod(webViewClass, @selector(becomeFirstResponder));
        method_setImplementation(webViewMethod, newTextFieldImplementation);
    }

    // Custom input accessory views
    Method inputAccessoryMethod = class_getInstanceMethod([UIResponder class], @selector(inputAccessoryView));
    if (inputAccessoryMethod) {
        IMP newInputAccessoryImplementation = imp_implementationWithBlock(^UIView*(id _self) {
            return nil;
        });
        method_setImplementation(inputAccessoryMethod, newInputAccessoryImplementation);
    }

    // Prevent focus state changes
    Method canBecomeFirstResponder = class_getInstanceMethod([UIResponder class], @selector(canBecomeFirstResponder));
    IMP newCanBecomeFirstResponder = imp_implementationWithBlock(^BOOL(id _self) {
        return NO;
    });
    method_setImplementation(canBecomeFirstResponder, newCanBecomeFirstResponder);
    
    // Prevent any existing first responder from keeping its state
    Method isFirstResponder = class_getInstanceMethod([UIResponder class], @selector(isFirstResponder));
    IMP newIsFirstResponder = imp_implementationWithBlock(^BOOL(id _self) {
        return NO;
    });
    method_setImplementation(isFirstResponder, newIsFirstResponder);

    NSLog(@"[%@] Enhanced keyboard and focus state swizzling enabled", LOG_TAG);
}

// Update the checkIfContainsStorybookError method
RCT_EXPORT_METHOD(checkIfContainsStorybookError:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
    dispatch_async(dispatch_get_main_queue(), ^{
        @try {
            UIWindow *keyWindow = [UIApplication sharedApplication].keyWindow;
            BOOL containsError = [StorybookErrorHelper checkIfContainsStorybookError:keyWindow];
            resolve(@(containsError));
        } @catch (NSException *exception) {
            reject(@"error", @"Error checking for Storybook error", nil);
        }
    });
}

@end
