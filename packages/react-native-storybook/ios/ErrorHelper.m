#import "ErrorHelper.h"
#import "FileSystemHelper.h"

static NSString *PROTOCOL_FILENAME = @"protocol.sherlo";
static NSString *const LOG_TAG = @"ErrorHelper";

@implementation ErrorHelper

// Handles errors by logging them and writing to the protocol file
+ (void)handleError:(NSString *)errorCode error:(id)error syncDirectoryPath:(NSString *)syncDirectoryPath {
  NSString *errorDescription;
  if ([error isKindOfClass:[NSError class]]) {
    errorDescription = [(NSError *)error localizedDescription] ?: @"N/A";
  } else if ([error isKindOfClass:[NSString class]]) {
    errorDescription = (NSString *)error;
  } else {
    errorDescription = [NSString stringWithFormat:@"%@", error];
  }
  
  NSLog(@"[%@] Error occurred: %@, Error: %@", LOG_TAG, errorCode, errorDescription);

  NSString *protocolFilePath = [syncDirectoryPath stringByAppendingPathComponent:PROTOCOL_FILENAME];
  
  NSMutableDictionary *nativeErrorDict = [@{
    @"action": @"NATIVE_ERROR",
    @"errorCode": errorCode,
    @"error": errorDescription,
    @"timestamp": @((long long)([[NSDate date] timeIntervalSince1970] * 1000)),
    @"entity": @"app"
  } mutableCopy];

  // Convert the dictionary to JSON data
  NSError *jsonError;
  NSData *jsonData = [NSJSONSerialization dataWithJSONObject:nativeErrorDict options:0 error:&jsonError];
  
  if (jsonError) {
    NSLog(@"[%@] Error creating JSON: %@", LOG_TAG, jsonError.localizedDescription);
    return;
  }
  
  // Convert JSON data to base64 string
  NSString *base64ErrorData = [jsonData base64EncodedStringWithOptions:0];
  
  NSError *writeError = [FileSystemHelper appendFile:protocolFilePath contents:base64ErrorData];
  if (writeError) {
    NSLog(@"[%@] Error writing to error file: %@", LOG_TAG, writeError.localizedDescription);
  }
}

/**
 * Instance method that delegates to the class method for handling errors.
 */
- (void)handleError:(NSString *)errorCode error:(id)error syncDirectoryPath:(NSString *)syncDirectoryPath {
  [ErrorHelper handleError:errorCode error:error syncDirectoryPath:syncDirectoryPath];
}

@end 