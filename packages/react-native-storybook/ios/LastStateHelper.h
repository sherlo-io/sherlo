#import <Foundation/Foundation.h>

@class FileSystemHelper;

/**
 * Helper class for extracting the last state information from protocol files.
 * Provides methods to read and parse the latest state for snapshot management.
 */
@interface LastStateHelper : NSObject

/**
 * Reads the protocol file and extracts the last state information.
 * This includes the next snapshot index, filtered view IDs, and request ID.
 * 
 * @param fileSystemHelper The file system helper for reading files
 * @return NSDictionary containing the state information or nil if not found
 */
+ (NSDictionary *)loadStateWithFileSystemHelper:(FileSystemHelper *)fileSystemHelper;

@end 