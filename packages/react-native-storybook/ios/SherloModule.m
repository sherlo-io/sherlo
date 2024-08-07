#import "SherloModule.h"
#import "StorybookViewController.h"
#import <Foundation/Foundation.h>
#import <React/RCTUtils.h>
#import <React/RCTUIManager.h>
#if __has_include(<React/RCTUIManagerUtils.h>)
#import <React/RCTUIManagerUtils.h>
#endif
#import <React/RCTBridge.h>

static NSString *CONFIG_FILENAME = @"config.sherlo";

static NSString *sherloDirectoryPath = @"";
static NSString *initialMode = @"default"; // "default" or "testing"

static StorybookViewController *currentStorybookViewController = nil;

@implementation SherloModule

RCT_EXPORT_MODULE()

@synthesize bridge = _bridge;

- (instancetype)init {
  self = [super init];
  if (self) {
    // Set Sherlo directory path
    sherloDirectoryPath = [[self getPathForDirectory:NSDocumentDirectory] stringByAppendingPathComponent:@"sherlo"];

    // If it's running on Sherlo server set Storybook mode
    NSString *configPath = [sherloDirectoryPath stringByAppendingPathComponent:CONFIG_FILENAME];
    BOOL doesSherloConfigFileExist = [[NSFileManager defaultManager] fileExistsAtPath:configPath];
    if (doesSherloConfigFileExist) {
      initialMode = @"testing";

      // present the view controller replacing the root view controller
      dispatch_async(dispatch_get_main_queue(), ^{
        UIWindow *window = [UIApplication sharedApplication].windows.firstObject;
        if (window) {
          RCTRootView *rootView = [[RCTRootView alloc] initWithBridge:self.bridge moduleName:@"SherloStorybook" initialProperties:nil];
          window.rootViewController.view = rootView;

          [UIView transitionWithView:window duration:0.5 options:UIViewAnimationOptionTransitionCrossDissolve animations:nil completion:nil];
        }
      });
    }
  }
  
  return self;
}

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

- (dispatch_queue_t)methodQueue {
  return RCTGetUIManagerQueue();
}

RCT_EXPORT_METHOD(toggleStorybook:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (currentStorybookViewController) {
      [self closeStorybookWithResolver:resolve rejecter:reject];
    } else {
      [self openStorybookWithResolver:resolve rejecter:reject];
    }
  });
}

RCT_EXPORT_METHOD(openStorybook:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  [self openStorybookWithResolver:resolve rejecter:reject];
}

- (void)openStorybookWithResolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject {
  dispatch_async(dispatch_get_main_queue(), ^{
    // present the view controller on top of the current view controller
    StorybookViewController *storybookViewController = [[StorybookViewController alloc] init];
    RCTRootView *rootView = [[RCTRootView alloc] initWithBridge:self.bridge moduleName:@"SherloStorybook" initialProperties:nil];
    storybookViewController.view = rootView;
    storybookViewController.modalPresentationStyle = UIModalPresentationFullScreen;

    UIViewController *rootVC = [UIApplication sharedApplication].windows.firstObject.rootViewController;
    if (rootVC) {
      [rootVC presentViewController:storybookViewController animated:YES completion:nil];
    }
    currentStorybookViewController = storybookViewController;
    resolve(nil);
  });
}

- (void)closeStorybookWithResolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject {
  dispatch_async(dispatch_get_main_queue(), ^{
    [currentStorybookViewController dismissViewControllerAnimated:YES completion:nil];
    currentStorybookViewController = nil;
    resolve(nil);
  });
}

RCT_EXPORT_METHOD(mkdir:(NSString *)filepath resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  NSError *error = nil;
  [[NSFileManager defaultManager] createDirectoryAtPath:filepath withIntermediateDirectories:YES attributes:nil error:&error];
  if (error) {
    reject(@"E_MKDIR", [NSString stringWithFormat:@"Failed to create directory at path %@", filepath], error);
  } else {
    resolve(nil);
  }
}

RCT_EXPORT_METHOD(appendFile:(NSString *)filepath contents:(NSString *)base64Content resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  NSData *data = [[NSData alloc] initWithBase64EncodedString:base64Content options:0];
  if (!data) {
    return reject(@"E_INVALIDBASE64", @"Invalid base64 content", nil);
  }

  if (![[NSFileManager defaultManager] fileExistsAtPath:filepath]) {
    BOOL success = [[NSFileManager defaultManager] createFileAtPath:filepath contents:data attributes:nil];
    if (!success) {
      return reject(@"ENOENT", [NSString stringWithFormat:@"ENOENT: no such file or directory, open '%@'", filepath], nil);
    } else {
      return resolve(nil);
    }
  }

  @try {
    NSFileHandle *fileHandle = [NSFileHandle fileHandleForUpdatingAtPath:filepath];
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
}

RCT_EXPORT_METHOD(readFile:(NSString *)filepath resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  if (![[NSFileManager defaultManager] fileExistsAtPath:filepath]) {
    return reject(@"ENOENT", [NSString stringWithFormat:@"ENOENT: no such file or directory, open '%@'", filepath], nil);
  }

  NSError *error = nil;
  NSData *content = [NSData dataWithContentsOfFile:filepath options:0 error:&error];
  if (error) {
    return [self reject:reject withError:error];
  }

  NSString *base64Content = [content base64EncodedStringWithOptions:0];
  resolve(base64Content);
}

- (NSString *)getPathForDirectory:(NSSearchPathDirectory)directory {
  NSArray *paths = NSSearchPathForDirectoriesInDomains(directory, NSUserDomainMask, YES);
  return [paths firstObject];
}

- (void)reject:(RCTPromiseRejectBlock)reject withError:(NSError *)error {
  NSString *codeWithDomain = [NSString stringWithFormat:@"E%@%zd", error.domain.uppercaseString, error.code];
  reject(codeWithDomain, error.localizedDescription, error);
}

- (NSDictionary *)constantsToExport {
  return @{
    @"syncDirectoryPath": sherloDirectoryPath,
    @"initialMode": initialMode
  };
}

@end
