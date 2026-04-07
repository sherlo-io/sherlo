#import "ProtocolHelper.h"
#import "FileSystemHelper.h"

static NSString *const LOG_TAG = @"SherloModule:ProtocolHelper";

/**
 * Helper for writing protocol.sherlo items.
 */
@implementation ProtocolHelper

/**
 * Writes a NATIVE_LOADED JSON line to protocol.sherlo.
 *
 * @param fileSystemHelper The file system helper
 * @param requestId The request ID (can be nil)
 */
+ (void)writeNativeLoaded:(FileSystemHelper *)fileSystemHelper requestId:(NSString *)requestId {
    NSMutableDictionary *item = [NSMutableDictionary dictionary];
    [item setObject:@([[NSDate date] timeIntervalSince1970] * 1000) forKey:@"timestamp"];
    [item setObject:@"app" forKey:@"entity"];
    [item setObject:@"NATIVE_LOADED" forKey:@"action"];
    if (requestId) {
        [item setObject:requestId forKey:@"requestId"];
    }

    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:item options:0 error:nil];
    NSString *jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
    jsonString = [jsonString stringByAppendingString:@"\n"];
    [fileSystemHelper appendFile:@"protocol.sherlo" content:jsonString];
}

/**
 * Writes a NATIVE_ERROR JSON line to protocol.sherlo.
 *
 * @param fileSystemHelper The file system helper
 * @param errorCode The error code
 * @param message Human-readable error description
 */
+ (void)writeNativeError:(FileSystemHelper *)fileSystemHelper errorCode:(NSString *)errorCode message:(NSString *)message {
    NSMutableDictionary *item = [NSMutableDictionary dictionary];
    [item setObject:@([[NSDate date] timeIntervalSince1970] * 1000) forKey:@"timestamp"];
    [item setObject:@"app" forKey:@"entity"];
    [item setObject:@"NATIVE_ERROR" forKey:@"action"];
    [item setObject:errorCode forKey:@"errorCode"];
    [item setObject:message forKey:@"message"];

    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:item options:0 error:nil];
    NSString *jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
    jsonString = [jsonString stringByAppendingString:@"\n"];
    [fileSystemHelper appendFile:@"protocol.sherlo" content:jsonString];
}

@end
