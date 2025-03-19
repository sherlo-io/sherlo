#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

@class ErrorHelper;

@interface FileSystemHelper : NSObject

+ (NSError *)mkdir:(NSString *)path;
+ (NSError *)appendFile:(NSString *)filepath contents:(NSString *)base64Content;
+ (NSString *)readFile:(NSString *)filepath error:(NSError **)error;

- (instancetype)initWithErrorHelper:(ErrorHelper *)errorHelper
                   syncDirectoryPath:(NSString *)syncDirectoryPath;

- (void)mkdirWithPath:(NSString *)filepath
              resolver:(RCTPromiseResolveBlock)resolve
              rejecter:(RCTPromiseRejectBlock)reject;

- (void)appendFileWithPath:(NSString *)filepath
              base64Content:(NSString *)base64Content
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject;

- (void)readFileWithPath:(NSString *)filepath
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject;

@property (nonatomic, strong) ErrorHelper *errorHelper;
@property (nonatomic, copy) NSString *syncDirectoryPath;

@end
