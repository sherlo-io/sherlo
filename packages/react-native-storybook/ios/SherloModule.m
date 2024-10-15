#import "SherloModule.h"

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

#import <React/RCTUtils.h>
#import <React/RCTUIManager.h>
#import <React/RCTBridge.h>
#import <React/RCTRootView.h>
#import <React/RCTBundleURLProvider.h>
#import <React/RCTReloadCommand.h>

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
static int urlConsumeCount = 0;

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
      
      // If the file exists, we are in testing mode
      BOOL doesSherloConfigFileExist = [[NSFileManager defaultManager] fileExistsAtPath:configPath];
      if (doesSherloConfigFileExist) {
        
        NSError *error = nil;
        NSString *configContent = [NSString stringWithContentsOfFile:configPath encoding:NSUTF8StringEncoding error:&error];
        if (error) {
          NSLog(@"[%@] Error reading config file: %@", LOG_TAG, error.localizedDescription);
        } else {
          NSData *jsonData = [configContent dataUsingEncoding:NSUTF8StringEncoding];
          NSDictionary *jsonDict = [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:&error];
          if (error) {
            NSLog(@"[%@] Error parsing JSON: %@", LOG_TAG, error.localizedDescription);
          } else {
            NSString *url = jsonDict[@"url"];
            if (url) {
              // Only process the URL if it's present in the config and hasn't been consumed twice yet
              if (urlConsumeCount < 2) {
                dispatch_async(dispatch_get_main_queue(), ^{
                  NSURL *nsurl = [NSURL URLWithString:url];
                  if ([[UIApplication sharedApplication] canOpenURL:nsurl]) {
                    [[UIApplication sharedApplication] openURL:nsurl options:@{} completionHandler:nil];
                    urlConsumeCount++; // Increment the counter after opening the URL
                    NSLog(@"[%@] URL consumed %d time(s)", LOG_TAG, urlConsumeCount);
                  } else {
                    NSLog(@"[%@] Cannot open URL: %@", LOG_TAG, url);
                  }
                });
              } else {
                mode = @"testing";
              }
            } else {
              mode = @"testing";
            }
          }
        }
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

// Opens the Storybook view in a separate view controller on top of the root view controller,
// allowing the user to return to the same app state after closing the Storybook.
// Exceptions during the opening process are caught and handled.
RCT_EXPORT_METHOD(openStorybook:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  mode = @"storybook";
  
  [self reload];
}

// Internal method to handle closing the Storybook view. This method is executed on the main queue.
// If any errors occur during the closing process, they are caught and the reject block is called with the appropriate error message.
RCT_EXPORT_METHOD(closeStorybook:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  mode = @"default";

  [self reload];
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


RCT_EXPORT_METHOD(dumpBoundries:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    @try {
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

      NSMutableArray *viewList = [NSMutableArray array];
      [self collectViewInfo:rootView intoArray:viewList];

      NSError *error;
      NSData *jsonData = [NSJSONSerialization dataWithJSONObject:viewList options:0 error:&error];
      if (error) {
        reject(@"json_error", @"Could not serialize view data to JSON", error);
        return;
      }

      NSString *jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
      if (!jsonString) {
        reject(@"string_error", @"Could not convert JSON data to string", nil);
        return;
      }

      resolve(jsonString);
    }
    @catch (NSException *exception) {
      reject(@"exception", exception.reason, nil);
    }
  });
}

- (void)reload
{
  if ([NSThread isMainThread]) {
    RCTTriggerReloadCommandListeners(@"Sherlo: Reload");
  } else {
    dispatch_sync(dispatch_get_main_queue(), ^{
    RCTTriggerReloadCommandListeners(@"Sherlo: Reload");
    });
  }
}

- (void)collectViewInfo:(UIView *)view intoArray:(NSMutableArray *)array
{
    NSMutableDictionary *viewDict = [NSMutableDictionary dictionary];

    // Class name
    NSString *className = NSStringFromClass([view class]);
    [viewDict setObject:className forKey:@"className"];

    // Check visibility
    BOOL isVisible = !view.hidden && view.alpha > 0.01 && view.window != nil;
    [viewDict setObject:@(isVisible) forKey:@"isVisible"];

    if (isVisible) {
        // Frame in window coordinates
        CGRect windowFrame = [view convertRect:view.bounds toView:nil];
        [viewDict setObject:@(windowFrame.origin.x) forKey:@"x"];
        [viewDict setObject:@(windowFrame.origin.y) forKey:@"y"];
        [viewDict setObject:@(windowFrame.size.width) forKey:@"width"];
        [viewDict setObject:@(windowFrame.size.height) forKey:@"height"];

        // Accessibility Identifier (optional)
        if (view.accessibilityIdentifier) {
            [viewDict setObject:view.accessibilityIdentifier forKey:@"accessibilityIdentifier"];
        }

        // Background Color (optional)
        if (view.backgroundColor) {
            CGFloat red, green, blue, alpha;
            [view.backgroundColor getRed:&red green:&green blue:&blue alpha:&alpha];
            NSString *hexColor = [NSString stringWithFormat:@"#%02lX%02lX%02lX",
                                   lroundf(red * 255),
                                   lroundf(green * 255),
                                   lroundf(blue * 255)];
            [viewDict setObject:hexColor forKey:@"backgroundColor"];
        }

        // Text and Font Size (for UILabel, UIButton, UITextField, etc.)
        if ([view isKindOfClass:[UILabel class]]) {
            UILabel *label = (UILabel *)view;
            if (label.text) {
                [viewDict setObject:label.text forKey:@"text"];
            }
            [viewDict setObject:@(label.font.pointSize) forKey:@"fontSize"];
        }
        else if ([view isKindOfClass:[UIButton class]]) {
            UIButton *button = (UIButton *)view;
            NSString *buttonText = [button titleForState:UIControlStateNormal];
            if (buttonText) {
                [viewDict setObject:buttonText forKey:@"text"];
            }
            [viewDict setObject:@(button.titleLabel.font.pointSize) forKey:@"fontSize"];
        }
        else if ([view isKindOfClass:[UITextField class]]) {
            UITextField *textField = (UITextField *)view;
            if (textField.text) {
                [viewDict setObject:textField.text forKey:@"text"];
            }
            [viewDict setObject:@(textField.font.pointSize) forKey:@"fontSize"];
        }
        // Add more view types as needed
    }

    [array addObject:viewDict];

    // Recursively collect subviews
    for (UIView *subview in view.subviews) {
        [self collectViewInfo:subview intoArray:array];
    }
}

- (NSString *)getSyncDirectoryPath
{
  // Use the app's documents directory
  NSArray<NSString *> *paths = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
  NSString *documentsDirectory = [paths firstObject];
  return documentsDirectory;
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
