#import <Foundation/Foundation.h>

@class FileSystemHelper;
@class ErrorHelper;

/**
 * Helper class for extracting the last state information from protocol files.
 * Provides methods to read and parse the latest state for snapshot management.
 */
@interface LastStateHelper : NSObject

/**
 * Initializes the LastStateHelper with required dependencies.
 *
 * @param fileSystemHelper The file system helper for reading files
 * @param errorHelper The error helper for handling errors
 * @param syncDirectoryPath The path to the sync directory
 * @return An initialized instance of LastStateHelper
 */
- (instancetype)initWithFileSystemHelper:(FileSystemHelper *)fileSystemHelper
                             errorHelper:(ErrorHelper *)errorHelper
                        syncDirectoryPath:(NSString *)syncDirectoryPath;

/**
 * Reads the protocol file and extracts the last state information.
 * This includes the next snapshot index, filtered view IDs, and request ID.
 * 
 * @return NSDictionary containing the state information or nil if not found
 */
- (NSDictionary *)getLastState;

@end 