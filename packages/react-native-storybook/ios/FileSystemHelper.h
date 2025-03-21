#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

@class ErrorHelper;

@interface FileSystemHelper : NSObject

/**
 * Creates a directory at the specified path.
 *
 * @param path The path where to create the directory
 * @return An error object if the operation fails, nil otherwise
 */
+ (NSError *)mkdir:(NSString *)path;

/**
 * Appends base64 encoded data to a file.
 *
 * @param filepath The path of the file to append to
 * @param base64Content The base64 encoded content to append
 * @return An error object if the operation fails, nil otherwise
 */
+ (NSError *)appendFile:(NSString *)filepath contents:(NSString *)base64Content;

/**
 * Reads a file and returns its content as base64 encoded string.
 * This is used for transferring binary data over the bridge.
 *
 * @param filepath The path of the file to read
 * @param error A pointer to an NSError object
 * @return The base64 encoded content of the file, or nil if an error occurs
 */
+ (NSString *)readFile:(NSString *)filepath error:(NSError **)error;

/**
 * Reads a file and returns its content as a string.
 * This is used for internal operations that need to work with text content.
 *
 * @param filepath The path of the file to read
 * @param error A pointer to an NSError object
 * @return The string content of the file, or nil if an error occurs
 */
+ (NSString *)readFileAsString:(NSString *)filepath error:(NSError **)error;

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
