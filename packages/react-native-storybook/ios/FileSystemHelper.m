#import "FileSystemHelper.h"

static NSString *syncDirectoryPath;

/**
 * Helper for reading files out of the shim's sync directory - config.sherlo
 * and protocol.sherlo, both left on disk by a previous run. Writing to that
 * directory is the injected implementation's job now: the shim never appends
 * to protocol.sherlo on its own.
 */
@implementation FileSystemHelper

- (instancetype)init {
    self = [super init];
    if (self) {
        NSArray *paths = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
        NSString *documentsDirectory = [paths firstObject];
        syncDirectoryPath = [documentsDirectory stringByAppendingPathComponent:@"sherlo"];
    }
    return self;
}

/**
 * Checks if a file exists in the sync directory.
 *
 * @param filename The relative path of the file to check
 * @return YES if the file exists, NO otherwise
 */
- (BOOL)fileExists:(NSString *)filename {
    NSString *absolutePath = [self getFileUri:filename];
    return [[NSFileManager defaultManager] fileExistsAtPath:absolutePath];
}

/**
 * Reads a file and returns its contents as a string.
 * Assumes UTF-8 encoding for the file content.
 *
 * @param filename The relative path of the file to read
 * @param error Pointer to an NSError that will be populated if an error occurs
 * @return The file contents as a string, or nil if an error occurs
 */
- (NSString *)readFile:(NSString *)filename error:(NSError **)error {
    NSString *absolutePath = [self getFileUri:filename];
    return [NSString stringWithContentsOfFile:absolutePath encoding:NSUTF8StringEncoding error:error];
}

/**
 * Converts a relative path to an absolute path in the sync directory.
 *
 * @param filename The file path to convert
 * @return The absolute path to the file
 */
- (NSString *)getFileUri:(NSString *)filename {
    return [syncDirectoryPath stringByAppendingPathComponent:filename];
}

@end
