#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

@interface FileSystemHelper : NSObject

#pragma mark - Initialization

/**
 * Initialize the FileSystemHelper.
 */
- (instancetype)init;

/**
 * Get the sync directory path.
 */
- (NSString *)getSyncDirectoryPath;

#pragma mark - File System Operations with Promise

/**
 * Appends base64 encoded content to a file.
 */
- (void)appendFileWithPath:(NSString *)filename 
              base64Content:(NSString *)base64Content 
                  resolver:(RCTPromiseResolveBlock)resolve 
                  rejecter:(RCTPromiseRejectBlock)reject;

/**
 * Reads a file and returns its contents as base64 encoded string.
 */
- (void)readFileWithPath:(NSString *)filename 
                resolver:(RCTPromiseResolveBlock)resolve 
                rejecter:(RCTPromiseRejectBlock)reject;

#pragma mark - Utility Methods

/**
 * Reads a file as string.
 * Used for internal operations that need to work with text content.
 */
- (NSString *)readFileAsString:(NSString *)filename error:(NSError **)error;

/**
 * Writes a string to a file.
 */
- (BOOL)writeString:(NSString *)string toFile:(NSString *)filename error:(NSError **)error;

/**
 * Gets the absolute path for a given filename.
 */
- (NSString *)getAbsolutePath:(NSString *)filename;

@end
