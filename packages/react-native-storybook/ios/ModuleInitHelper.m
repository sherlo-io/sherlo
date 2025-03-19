#import "ModuleInitHelper.h"
#import "ConfigHelper.h"
#import "ExpoUpdateHelper.h"
#import "KeyboardHelper.h"

static NSString *const LOG_TAG = @"ModuleInitHelper";

@implementation ModuleInitHelper

// Initializes the Sherlo module, sets up necessary directory paths, and checks if testing mode is required.
// If a configuration file exists, the module sets up the application in testing mode and presents the Storybook view.
// Exceptions are caught and logged.
+ (void)initialize:(NSString **)syncDirectoryPathRef modeRef:(NSString **)modeRef configRef:(NSDictionary **)configRef errorHandler:(void(^)(NSString *, id))errorHandler {
  @try {
    NSLog(@"[%@] Initializing Sherlo Module", LOG_TAG);

    NSError *getSyncDirectoryPathError = nil;
    *syncDirectoryPathRef = [ConfigHelper getSyncDirectoryPath:&getSyncDirectoryPathError];
    if (getSyncDirectoryPathError) {
      errorHandler(@"ERROR_MODULE_INIT", getSyncDirectoryPathError);
      return;
    }

    NSError *loadConfigError = nil;
    *configRef = [ConfigHelper loadConfig:&loadConfigError syncDirectoryPath:*syncDirectoryPathRef];
    if (loadConfigError) {
      errorHandler(@"ERROR_MODULE_INIT", loadConfigError);
      return;
    }
    
    // if there's a config, we are in testing mode
    if(*configRef) {
      NSString *overrideMode = (*configRef)[@"overrideMode"];
      if (overrideMode) {
        *modeRef = overrideMode;
        return;
      }

      NSString *expoUpdateDeeplink = (*configRef)[@"expoUpdateDeeplink"];
      
      if (expoUpdateDeeplink) {
        NSLog(@"[%@] Consuming expo update deeplink", LOG_TAG);

        NSError *expoUpdateError = nil;
        // This function will set the mode to "testing" if it consumes the expo update deeplink
        [ExpoUpdateHelper consumeExpoUpdateDeeplink:expoUpdateDeeplink modeRef:modeRef error:&expoUpdateError];

        if ([@"testing" isEqualToString:*modeRef]) {
          [self setupKeyboardSwizzlingIfNeeded:*modeRef];
        }
        
        if (expoUpdateError) {
          errorHandler(@"ERROR_OPENING_EXPO_DEEPLINK", expoUpdateError);
        }
      } else {
        [self setupKeyboardSwizzlingIfNeeded:@"testing"];
        // If the expoUpdateDeeplink is not present in the config, we are immediately in testing mode
        *modeRef = @"testing";
      }
    }
  } @catch (NSException *exception) {
    errorHandler(@"ERROR_MODULE_INIT", exception.reason);
  }
}

+ (void)setupKeyboardSwizzlingIfNeeded:(NSString *)mode {
  if ([mode isEqualToString:@"testing"]) {
    [KeyboardHelper setupKeyboardSwizzling];
  }
}

@end 