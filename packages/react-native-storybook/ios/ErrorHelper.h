#import <Foundation/Foundation.h>

@interface ErrorHelper : NSObject

+ (void)handleError:(NSString *)errorCode error:(id)error syncDirectoryPath:(NSString *)syncDirectoryPath;

/**
 * Instance method for handling errors.
 *
 * @param errorCode The error code
 * @param error The error message or object
 * @param syncDirectoryPath The sync directory path
 */
- (void)handleError:(NSString *)errorCode error:(id)error syncDirectoryPath:(NSString *)syncDirectoryPath;

@end 