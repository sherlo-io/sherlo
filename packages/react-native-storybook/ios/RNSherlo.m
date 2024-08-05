#import "RNSherlo.h"
#import "StorybookViewController.h"
#import <Foundation/Foundation.h>
#import <React/RCTUtils.h>
#import <React/RCTUIManager.h>
#if __has_include(<React/RCTUIManagerUtils.h>)
  #import <React/RCTUIManagerUtils.h>
#endif
#import <React/RCTBridge.h>

static NSString *sherloDirectoryPath = @"";
static NSString *CONFIG_FILENAME = @"config.sherlo";

static StorybookViewController *currentStorybookViewController = nil;
static UIViewController *originalRootViewController = nil;

@implementation RNSherlo

RCT_EXPORT_MODULE()

@synthesize bridge = _bridge;

- (instancetype)init
{
  self = [super init];
  if (self) {
    // Set Sherlo directory path
    sherloDirectoryPath = [[self getPathForDirectory:NSDocumentDirectory] stringByAppendingPathComponent:@"sherlo"];

    // If it's running on Sherlo server set Storybook mode
    NSString *configPath = [sherloDirectoryPath stringByAppendingPathComponent:CONFIG_FILENAME];
    BOOL doesSherloConfigFileExist = [[NSFileManager defaultManager] fileExistsAtPath:configPath isDirectory:NO];
    if (doesSherloConfigFileExist) {
        [self openStorybookInternal:YES];
    }
  }
  return self;
}

- (dispatch_queue_t)methodQueue
{
  return RCTGetUIManagerQueue();
}

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

RCT_EXPORT_METHOD(toggleStorybook:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    dispatch_async(dispatch_get_main_queue(), ^{
        if (currentStorybookViewController) {
            [self closeStorybookWithResolver:resolve rejecter:reject];
        } else {
            [self openStorybookWithResolver:resolve rejecter:reject];
        }
    });
}

RCT_EXPORT_METHOD(openStorybook:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    [self openStorybookInternal:NO];
    resolve(nil);
}

- (void)openStorybookWithResolver:(RCTPromiseResolveBlock)resolve
                         rejecter:(RCTPromiseRejectBlock)reject
{
    [self openStorybookInternal:NO];
    resolve(nil);
}

- (void)closeStorybookWithResolver:(RCTPromiseResolveBlock)resolve
                          rejecter:(RCTPromiseRejectBlock)reject
{
    if (currentStorybookViewController) {
        UIWindow *window = [UIApplication sharedApplication].delegate.window;

        if (originalRootViewController) {
            // Restore the original root view controller
            window.rootViewController = originalRootViewController;

            // Animate the transition (optional)
            [UIView transitionWithView:window
                              duration:0.5
                               options:UIViewAnimationOptionTransitionCrossDissolve
                            animations:nil
                            completion:nil];

            originalRootViewController = nil;
        } else {
            [currentStorybookViewController dismissViewControllerAnimated:YES completion:nil];
        }

        currentStorybookViewController = nil;
    }

    resolve(nil);
}

RCT_EXPORT_METHOD(openStorybookInternal:(BOOL)singleRootController)
{
    dispatch_async(dispatch_get_main_queue(), ^{
        // create a new view controller and set the root view to the storybook
        StorybookViewController *storybookViewController = [[StorybookViewController alloc] init];
        RCTRootView *rootView = [[RCTRootView alloc] initWithBridge:_bridge moduleName:@"SherloStorybook" initialProperties:nil];
        storybookViewController.view = rootView;
        
        // Set the modal presentation style to full screen
        storybookViewController.modalPresentationStyle = UIModalPresentationFullScreen;

        UIWindow *window = [UIApplication sharedApplication].delegate.window;
        
        if (singleRootController) {
            // Save the original root view controller
            originalRootViewController = window.rootViewController;

            // Replace the root view controller with the storybook view controller
            window.rootViewController = storybookViewController;

            // Animate the transition (optional)
            [UIView transitionWithView:window
                              duration:0.5
                               options:UIViewAnimationOptionTransitionCrossDissolve
                            animations:nil
                            completion:nil];
        } else {
            // Present the view controller
            [window.rootViewController presentViewController:storybookViewController animated:YES completion:nil];
        }

        // Store reference to the presented view controller
        currentStorybookViewController = storybookViewController;
    });
}

RCT_EXPORT_METHOD(closeStorybook:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    dispatch_async(dispatch_get_main_queue(), ^{
        if (currentStorybookViewController) {
            UIWindow *window = [UIApplication sharedApplication].delegate.window;

            if (originalRootViewController) {
                // Restore the original root view controller
                window.rootViewController = originalRootViewController;

                // Animate the transition (optional)
                [UIView transitionWithView:window
                                  duration:0.5
                                   options:UIViewAnimationOptionTransitionCrossDissolve
                                animations:nil
                                completion:nil];

                originalRootViewController = nil;
            } else {
                [currentStorybookViewController dismissViewControllerAnimated:YES completion:nil];
            }

            currentStorybookViewController = nil;
        }

        resolve(nil);
    });
}

RCT_EXPORT_METHOD(checkIfShowsRedbox: (NSDictionary *)options
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) 
{
  [self.bridge.uiManager addUIBlock:^(__unused RCTUIManager *uiManager, NSDictionary<NSNumber *, UIView *> *viewRegistry) {
    
    UIWindow *window = [[UIApplication sharedApplication] keyWindow];
    NSString *s = @"";
    for(id key in viewRegistry)
    {
        Class cl = [[viewRegistry objectForKey:key] class];
        NSString *classString = NSStringFromClass(cl);
        NSString *classDescription = [cl description];
        s = [s stringByAppendingString:@"\n"];
        s = [s stringByAppendingString:@"\n"];
        s = [s stringByAppendingString:classString];
        s = [s stringByAppendingString:@"\n"];
        s = [s stringByAppendingString:classDescription];
    }
    resolve(s);
  }];
}

RCT_EXPORT_METHOD(readFile:(NSString *)filepath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  BOOL fileExists = [[NSFileManager defaultManager] fileExistsAtPath:filepath];

  if (!fileExists) {
    return reject(@"ENOENT", [NSString stringWithFormat:@"ENOENT: no such file or directory, open '%@'", filepath], nil);
  }

  NSError *error = nil;

  NSDictionary *attributes = [[NSFileManager defaultManager] attributesOfItemAtPath:filepath error:&error];

  if (error) {
    return [self reject:reject withError:error];
  }

  if ([attributes objectForKey:NSFileType] == NSFileTypeDirectory) {
    return reject(@"EISDIR", @"EISDIR: illegal operation on a directory, read", nil);
  }

  NSData *content = [[NSFileManager defaultManager] contentsAtPath:filepath];
  NSString *base64Content = [content base64EncodedStringWithOptions:NSDataBase64EncodingEndLineWithLineFeed];

  resolve(base64Content);
}


RCT_EXPORT_METHOD(mkdir:(NSString *)filepath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSFileManager *manager = [NSFileManager defaultManager];

  NSMutableDictionary *attributes = [[NSMutableDictionary alloc] init];

  NSError *error = nil;
    BOOL success = [manager createDirectoryAtPath:filepath withIntermediateDirectories:YES attributes:attributes error:&error];

  if (!success) {
    return [self reject:reject withError:error];
  }

  NSURL *url = [NSURL fileURLWithPath:filepath];

  resolve(nil);
}

RCT_EXPORT_METHOD(appendFile:(NSString *)filepath
                  contents:(NSString *)base64Content
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSData *data = [[NSData alloc] initWithBase64EncodedString:base64Content options:NSDataBase64DecodingIgnoreUnknownCharacters];

  NSFileManager *fM = [NSFileManager defaultManager];

  if (![fM fileExistsAtPath:filepath])
  {
    BOOL success = [[NSFileManager defaultManager] createFileAtPath:filepath contents:data attributes:nil];

    if (!success) {
      return reject(@"ENOENT", [NSString stringWithFormat:@"ENOENT: no such file or directory, open '%@'", filepath], nil);
    } else {
      return resolve(nil);
    }
  }

  @try {
    NSFileHandle *fH = [NSFileHandle fileHandleForUpdatingAtPath:filepath];

    [fH seekToEndOfFile];
    [fH writeData:data];

    return resolve(nil);
  } @catch (NSException *exception) {
    NSMutableDictionary * info = [NSMutableDictionary dictionary];
    [info setValue:exception.name forKey:@"ExceptionName"];
    [info setValue:exception.reason forKey:@"ExceptionReason"];
    [info setValue:exception.callStackReturnAddresses forKey:@"ExceptionCallStackReturnAddresses"];
    [info setValue:exception.callStackSymbols forKey:@"ExceptionCallStackSymbols"];
    [info setValue:exception.userInfo forKey:@"ExceptionUserInfo"];
    NSError *err = [NSError errorWithDomain:@"RNFS" code:0 userInfo:info];
    return [self reject:reject withError:err];
  }
}

- (NSString *)getPathForDirectory:(int)directory
{
  NSArray *paths = NSSearchPathForDirectoriesInDomains(directory, NSUserDomainMask, YES);
  return [paths firstObject];
}

- (void)reject:(RCTPromiseRejectBlock)reject withError:(NSError *)error
{
  NSString *codeWithDomain = [NSString stringWithFormat:@"E%@%zd", error.domain.uppercaseString, error.code];
  reject(codeWithDomain, error.localizedDescription, error);
}

- (NSDictionary *)constantsToExport
{
  return @{
           @"sherloDirectoryPath": sherloDirectoryPath,
          };
}

@end
