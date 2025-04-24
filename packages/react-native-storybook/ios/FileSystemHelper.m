#import "FileSystemHelper.h"

static NSString *const LOG_TAG = @"SherloModule:FileSystemHelper";
static NSString *syncDirectoryPath;

/**
 * Helper for file system operations in the Sherlo module.
 * Manages a dedicated synchronization directory for storing and retrieving files,
 * and provides methods for reading and writing data with Base64 encoding.
 */
@implementation FileSystemHelper

/**
 * Initializes a new instance of the FileSystemHelper.
 * Sets up the sync directory during initialization.
 *
 * @return A new FileSystemHelper instance
 */
- (instancetype)init {
    self = [super init];
    if (self) {
        syncDirectoryPath = [self setupSyncDirectory];
    }
    return self;
}

/**
 * Creates and sets up the synchronization directory in the app's documents folder.
 * The directory will be used for all file operations performed by this helper.
 *
 * @return The absolute path to the sync directory
 */
- (NSString *)setupSyncDirectory {
    NSArray *paths = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
    NSString *documentsDirectory = [paths firstObject];
    NSString *sherloDirectory = [documentsDirectory stringByAppendingPathComponent:@"sherlo"];
    
    // Create the directory if it doesn't exist
    NSError *error = nil;
    [[NSFileManager defaultManager] createDirectoryAtPath:sherloDirectory
                              withIntermediateDirectories:YES
                                               attributes:nil
                                                    error:&error];
    
    if (error) {
        NSLog(@"[%@] Failed to create sync directory: %@", LOG_TAG, error.localizedDescription);
    }
    
    return sherloDirectory;
}

#pragma mark - File System Operations with Promise

/**
 * Appends base64 encoded content to a file, creating the file if it doesn't exist.
 * Returns a promise that resolves when the operation completes or rejects on error.
 *
 * @param filename The relative path of the file to append to
 * @param base64Content The base64 encoded content to append
 * @param resolve Promise resolver to call when the operation completes
 * @param reject Promise rejecter to call if an error occurs
 */
- (void)appendFileWithPromise:(NSString *)filename base64Content:(NSString *)base64Content resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    NSString *absolutePath = [self getFileUri:filename];
    
    // Decode base64 content
    NSData *data = [[NSData alloc] initWithBase64EncodedString:base64Content options:0];
    if (!data) {
        reject(@"ERROR_APPEND_FILE", @"Invalid base64 content", nil);
        return;
    }
    
    NSFileManager *fileManager = [NSFileManager defaultManager];
    
    // Create parent directories if needed
    NSString *directoryPath = [absolutePath stringByDeletingLastPathComponent];
    NSError *directoryError = nil;
    [fileManager createDirectoryAtPath:directoryPath withIntermediateDirectories:YES attributes:nil error:&directoryError];
    
    if (directoryError) {
        reject(@"ERROR_APPEND_FILE", [NSString stringWithFormat:@"Error creating parent directory: %@", directoryError.localizedDescription], directoryError);
        return;
    }
    
    // Append data to file
    if (![fileManager fileExistsAtPath:absolutePath]) {
        // Create new file if it doesn't exist
        BOOL success = [fileManager createFileAtPath:absolutePath contents:data attributes:nil];
        if (!success) {
            reject(@"ERROR_APPEND_FILE", @"Failed to create file", nil);
            return;
        }
    } else {
        // Append to existing file
        NSFileHandle *fileHandle = [NSFileHandle fileHandleForUpdatingAtPath:absolutePath];
        if (!fileHandle) {
            reject(@"ERROR_APPEND_FILE", @"Failed to get file handle", nil);
            return;
        }
        
        @try {
            [fileHandle seekToEndOfFile];
            [fileHandle writeData:data];
            [fileHandle closeFile];
        } @catch (NSException *exception) {
            reject(@"ERROR_APPEND_FILE", [NSString stringWithFormat:@"Exception while appending: %@", exception.reason], nil);
            return;
        }
    }
    
    resolve(nil);
}

/**
 * Reads a file and returns its contents as a base64 encoded string.
 * Returns a promise that resolves with the file content or rejects on error.
 *
 * @param filename The relative path of the file to read
 * @param resolve Promise resolver to call with the base64 encoded file content
 * @param reject Promise rejecter to call if an error occurs
 */
- (void)readFileWithPromise:(NSString *)filename resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    NSString *absolutePath = [self getFileUri:filename];
    
    NSFileManager *fileManager = [NSFileManager defaultManager];
    if (![fileManager fileExistsAtPath:absolutePath]) {
        reject(@"ERROR_READ_FILE", [NSString stringWithFormat:@"File not found: %@", filename], nil);
        return;
    }
    
    NSError *error = nil;
    NSData *content = [NSData dataWithContentsOfFile:absolutePath options:0 error:&error];
    
    if (error) {
        reject(@"ERROR_READ_FILE", [NSString stringWithFormat:@"Error reading file: %@", error.localizedDescription], error);
        return;
    }
    
    if (!content) {
        resolve(@""); // Empty file
        return;
    }
    
    NSString *base64String = [content base64EncodedStringWithOptions:0];
    resolve(base64String);
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
