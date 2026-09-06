#import <Foundation/Foundation.h>

@interface FileSystemHelper : NSObject

/**
 * Initialize the FileSystemHelper.
 */
- (instancetype)init;

/**
 * Checks if a file exists in the sync directory.
 */
- (BOOL)fileExists:(NSString *)filename;

/**
 * Reads a file as string.
 */
- (NSString *)readFile:(NSString *)filename error:(NSError **)error;

/**
 * Gets the absolute path for a given filename.
 */
- (NSString *)getFileUri:(NSString *)filename;

@end
