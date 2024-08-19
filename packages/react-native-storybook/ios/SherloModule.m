#import "SherloModule.h"

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

#import <React/RCTUtils.h>
#import <React/RCTUIManager.h>
#import <React/RCTBridge.h>

// A safeguard to ensure compatibility with different versions of React Native
#if __has_include(<React/RCTUIManagerUtils.h>)
// These are necessary for any interactions with the React Native UI Manager 
// (e.g., operations on RCTRootView).
#import <React/RCTUIManagerUtils.h>
#endif

static NSString *CONFIG_FILENAME = @"config.sherlo";
static NSString *const LOG_TAG = @"SherloModule";

static NSString *syncDirectoryPath = @"";
static NSString *initialMode = @"default"; // "default" or "testing"
static BOOL isStorybookRegistered = NO;

// We keep this reference to determine if the Storybook is currently open
// and to be able to close it
static UIViewController *currentStorybookViewController = nil;

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
      
      // If the file exists, we are in testing mode and will open the 
      // Storybook in single activity mode, without launching the app
      BOOL doesSherloConfigFileExist = [[NSFileManager defaultManager] fileExistsAtPath:configPath];
      if (doesSherloConfigFileExist) {
        initialMode = @"testing";
      }
    } @catch (NSException *exception) {
      NSLog(@"[%@] Exception occurred: %@, %@", LOG_TAG, exception.reason, exception.userInfo);
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
    @"initialMode": initialMode
  };
}

RCT_EXPORT_METHOD(storybookRegistered:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
    isStorybookRegistered = YES;

    // Present the view controller replacing the root view controller, 
    // the application root controller will never be shown
    dispatch_async(dispatch_get_main_queue(), ^{
      @try {
        if (initialMode == @"testing") {
          UIWindow *window = [UIApplication sharedApplication].windows.firstObject;
          if (!window) {
            return reject(@"E_NO_WINDOW", @"Failed to get the application window", nil);
          }

          UIViewController *rootViewController = window.rootViewController;
          if (!rootViewController) {
            return reject(@"E_NO_ROOTVC", @"No root view controller available", nil);
          }

          RCTRootView *rootView = [[RCTRootView alloc] initWithBridge:self.bridge moduleName:@"SherloStorybook" initialProperties:nil];
          if (!rootView) {
            return reject(@"E_CREATE_ROOTVIEW", @"Failed to create RCTRootView for Storybook", nil);
          }

          rootViewController.view = rootView;
          [UIView transitionWithView:window duration:0.5 options:UIViewAnimationOptionTransitionCrossDissolve animations:nil completion:^(BOOL finished) {
            if (!finished) {
              return reject(@"E_NO_WINDOW", @"Failed to transition into storybook view", nil);
            }
          }];

          resolve(nil);
        }
      } @catch (NSException *exception) {
        [self handleException:exception rejecter:reject];
      }
    });
}

// Toggles the Storybook view. If the Storybook is currently open, it closes it. Otherwise, it opens it.
// Exceptions during the toggle are caught and handled.
RCT_EXPORT_METHOD(toggleStorybook:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  if (currentStorybookViewController) {
    [self closeStorybookInternal:resolve rejecter:reject];
  } else {
    [self openStorybookInternal:resolve rejecter:reject];
  }
}

// Opens the Storybook view in a separate view controller on top of the root view controller,
// allowing the user to return to the same app state after closing the Storybook.
// Exceptions during the opening process are caught and handled.
RCT_EXPORT_METHOD(openStorybook:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  if(!isStorybookRegistered) {
    return reject(@"NOT_REGISTERED", @"Storybook is not registered", nil);
  }

  [self openStorybookInternal:resolve rejecter:reject];
}

// Internal method to handle opening the Storybook view. We create a separate view controller
// and display it on top of the root view controller, so that user can go back to the app state
- (void)openStorybookInternal:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject {
  dispatch_async(dispatch_get_main_queue(), ^{
    @try {
      UIViewController *storybookViewController = [[UIViewController alloc] init];
      if (!storybookViewController) {
        return reject(@"E_CREATE_VC", @"Failed to create Storybook view controller", nil);
      }

      RCTRootView *rootView = [[RCTRootView alloc] initWithBridge:self.bridge moduleName:@"SherloStorybook" initialProperties:nil];
      if (!rootView) {
        return reject(@"E_CREATE_ROOTVIEW", @"Failed to create RCTRootView for Storybook", nil);
      }
      storybookViewController.view = rootView;
      storybookViewController.modalPresentationStyle = UIModalPresentationFullScreen;

      UIWindow *window = [UIApplication sharedApplication].windows.firstObject;
      if (!window) {
        return reject(@"E_NO_WINDOW", @"Failed to get the application window", nil);
      }

      UIViewController *rootVC = window.rootViewController;
      if (!rootVC) {
        return reject(@"E_NO_ROOTVC", @"No root view controller available", nil);
      }

      [rootVC presentViewController:storybookViewController animated:YES completion:nil];

      currentStorybookViewController = storybookViewController;
      resolve(nil);
    } @catch (NSException *exception) {
      [self handleException:exception rejecter:reject];
    }
  });
}

// Internal method to handle closing the Storybook view. This method is executed on the main queue.
// If any errors occur during the closing process, they are caught and the reject block is called with the appropriate error message.
- (void)closeStorybookInternal:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject {
  dispatch_async(dispatch_get_main_queue(), ^{
    @try {
      if (!currentStorybookViewController) {
        NSLog(@"[%@] Error: There is no active storybook view controller to close.", LOG_TAG);
      }

      [currentStorybookViewController dismissViewControllerAnimated:YES completion:nil];
      currentStorybookViewController = nil;
      resolve(nil);
    } @catch (NSException *exception) {
      [self handleException:exception rejecter:reject];
    }
  });
}

// Creates a directory at the specified filepath.
// If the directory creation fails, the reject block is called with an appropriate error message.
RCT_EXPORT_METHOD(mkdir:(NSString *)filepath resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  @try {
    NSError *error = nil;
    [[NSFileManager defaultManager] createDirectoryAtPath:filepath withIntermediateDirectories:YES attributes:nil error:&error];
    if (error) {
      return reject(@"E_MKDIR", [NSString stringWithFormat:@"Failed to create directory at path %@", filepath], error);
    } else {
      resolve(nil);
    }
  } @catch (NSException *exception) {
    [self handleException:exception rejecter:reject];
  }
}

// Appends a base64 encoded file to the specified filepath.
// If the file does not exist, it creates a new file.
// If any errors occur during the append process, the reject block is called with an appropriate error message.
RCT_EXPORT_METHOD(appendFile:(NSString *)filepath contents:(NSString *)base64Content resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  @try {
    NSData *data = [[NSData alloc] initWithBase64EncodedString:base64Content options:0];
    if (!data) {
      return reject(@"E_INVALIDBASE64", @"Invalid base64 content", nil);
    }

    if (![[NSFileManager defaultManager] fileExistsAtPath:filepath]) {
      BOOL success = [[NSFileManager defaultManager] createFileAtPath:filepath contents:data attributes:nil];
      if (!success) {
        NSError *error = [NSError errorWithDomain:NSCocoaErrorDomain code:NSFileWriteUnknownError userInfo:nil];
        return reject(@"ENOENT", [NSString stringWithFormat:@"ENOENT: no such file or directory, open '%@'", filepath], error);
      } else {
        return resolve(nil);
      }
    }

    @try {
      NSFileHandle *fileHandle = [NSFileHandle fileHandleForUpdatingAtPath:filepath];
      if (!fileHandle) {
        return reject(@"E_NOFILEHANDLE", [NSString stringWithFormat:@"Failed to get file handle for path %@", filepath], nil);
      }
      [fileHandle seekToEndOfFile];
      [fileHandle writeData:data];
      [fileHandle closeFile];
      
      resolve(nil);
    } @catch (NSException *exception) {
      NSMutableDictionary *info = [NSMutableDictionary dictionary];
      [info setValue:exception.name forKey:@"ExceptionName"];
      [info setValue:exception.reason forKey:@"ExceptionReason"];
      NSError *error = [NSError errorWithDomain:@"SherloModule" code:0 userInfo:info];
      reject(@"E_WRITEFILE", @"Failed to append data to file", error);
    }
  } @catch (NSException *exception) {
    [self handleException:exception rejecter:reject];
  }
}

// Reads a byte array from the specified file and returns it as a base64 string.
// If the file does not exist or if any errors occur during the read process, the reject block is called with an appropriate error message.
RCT_EXPORT_METHOD(readFile:(NSString *)filepath resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  @try {
    if (![[NSFileManager defaultManager] fileExistsAtPath:filepath]) {
      return reject(@"ENOENT", [NSString stringWithFormat:@"ENOENT: no such file or directory, open '%@'", filepath], nil);
    }

    NSError *error = nil;
    NSData *content = [NSData dataWithContentsOfFile:filepath options:0 error:&error];
    if (error) {
      return reject([NSString stringWithFormat:@"%ld", (long)error.code], error.localizedDescription ?: @"Unknown error occurred", error);
    }

    NSString *base64Content = [content base64EncodedStringWithOptions:0];
    if (!base64Content) {
      return reject(@"E_ENCODING", @"Failed to encode file content to base64", nil);
    }

    resolve(base64Content);
  } @catch (NSException *exception) {
    [self handleException:exception rejecter:reject];
  }
}

// Handles exceptions by logging the error and rejecting the promise with an appropriate error message.
- (void)handleException:(NSException *)exception rejecter:(RCTPromiseRejectBlock)reject {
  NSMutableDictionary *info = [NSMutableDictionary dictionary];
  [info setValue:exception.name forKey:@"ExceptionName"];
  [info setValue:exception.reason forKey:@"ExceptionReason"];

  NSError *error = [NSError errorWithDomain:@"SherloModule" code:0 userInfo:info];
  reject(@"E_EXCEPTION", @"Exception occurred", error);
}

@end
