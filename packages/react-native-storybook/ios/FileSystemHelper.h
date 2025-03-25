#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

@interface FileSystemHelper : NSObject

/**
 * Initialize the FileSystemHelper.
 */
- (instancetype)init;

/**
 * Appends base64 encoded content to a file.
 */
- (void)appendFileWithPromise:(NSString *)filename 
                base64Content:(NSString *)base64Content 
                    resolver:(RCTPromiseResolveBlock)resolve 
                    rejecter:(RCTPromiseRejectBlock)reject;

/**
 * Reads a file and returns its contents as base64 encoded string.
 */
- (void)readFileWithPromise:(NSString *)filename 
                  resolver:(RCTPromiseResolveBlock)resolve 
                  rejecter:(RCTPromiseRejectBlock)reject;

/**
 * Checks if a file exists in the sync directory.
 */
- (BOOL)fileExists:(NSString *)filename;

/**
 * Reads a file as string.
 * Used for internal operations that need to work with text content.
 */
- (NSString *)readFile:(NSString *)filename error:(NSError **)error;

/**
 * Gets the absolute path for a given filename.
 */
- (NSString *)getFileUri:(NSString *)filename;

@end
