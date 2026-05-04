#import "ProtocolHelper.h"
#import "FileSystemHelper.h"

static NSString *const LOG_TAG = @"SherloModule:ProtocolHelper";

/**
 * Helper for writing protocol.sherlo items.
 */
@implementation ProtocolHelper

// Private helper: JSON-encode item dict, append newline, write to protocol.sherlo.
+ (void)appendProtocolLine:(NSDictionary *)item to:(FileSystemHelper *)fs {
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:item options:0 error:nil];
    if (!jsonData) return;
    NSString *line = [[[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding] stringByAppendingString:@"\n"];
    [fs appendFile:@"protocol.sherlo" content:line];
}

/**
 * Writes a NATIVE_INIT_STARTED JSON line to protocol.sherlo.
 * Called only when in testing mode so the runner can detect that the native
 * constructor was reached.
 */
+ (void)writeNativeInitStarted:(FileSystemHelper *)fileSystemHelper {
    NSMutableDictionary *item = [NSMutableDictionary dictionary];
    [item setObject:@([[NSDate date] timeIntervalSince1970] * 1000) forKey:@"timestamp"];
    [item setObject:@"app" forKey:@"entity"];
    [item setObject:@"NATIVE_INIT_STARTED" forKey:@"action"];
    [self appendProtocolLine:item to:fileSystemHelper];
}

/**
 * Writes a NATIVE_LOADED JSON line to protocol.sherlo.
 */
+ (void)writeNativeLoaded:(FileSystemHelper *)fileSystemHelper requestId:(NSString *)requestId {
    NSMutableDictionary *item = [NSMutableDictionary dictionary];
    [item setObject:@([[NSDate date] timeIntervalSince1970] * 1000) forKey:@"timestamp"];
    [item setObject:@"app" forKey:@"entity"];
    [item setObject:@"NATIVE_LOADED" forKey:@"action"];
    if (requestId) {
        [item setObject:requestId forKey:@"requestId"];
    }
    [self appendProtocolLine:item to:fileSystemHelper];
}

/**
 * Writes a NATIVE_ERROR JSON line to protocol.sherlo.
 */
+ (void)writeNativeError:(FileSystemHelper *)fileSystemHelper errorCode:(NSString *)errorCode message:(NSString *)message dataJson:(NSString *)dataJson {
    NSMutableDictionary *item = [NSMutableDictionary dictionary];
    [item setObject:@([[NSDate date] timeIntervalSince1970] * 1000) forKey:@"timestamp"];
    [item setObject:@"app" forKey:@"entity"];
    [item setObject:@"NATIVE_ERROR" forKey:@"action"];
    [item setObject:errorCode forKey:@"errorCode"];
    [item setObject:message forKey:@"message"];
    if (dataJson && dataJson.length > 0) {
        NSDictionary *data = [NSJSONSerialization JSONObjectWithData:[dataJson dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];
        if (data) {
            [item setObject:data forKey:@"data"];
        }
    }
    [self appendProtocolLine:item to:fileSystemHelper];
}

/**
 * Writes a JS_ERROR JSON line to protocol.sherlo.
 */
+ (void)writeJsError:(FileSystemHelper *)fileSystemHelper message:(NSString *)message stack:(NSString *)stack source:(NSString *)source {
    NSMutableDictionary *item = [NSMutableDictionary dictionary];
    [item setObject:@([[NSDate date] timeIntervalSince1970] * 1000) forKey:@"timestamp"];
    [item setObject:@"app" forKey:@"entity"];
    [item setObject:@"JS_ERROR" forKey:@"action"];
    NSMutableDictionary *data = [NSMutableDictionary dictionary];
    [data setObject:message ?: @"" forKey:@"message"];
    [data setObject:stack ?: @"" forKey:@"stack"];
    [data setObject:source ?: @"" forKey:@"source"];
    [item setObject:data forKey:@"data"];
    [self appendProtocolLine:item to:fileSystemHelper];
}

/**
 * Writes a JS_ERROR JSON line with full payload for module-eval errors caught by the metro polyfill.
 * Returns YES on success, NO if JSON encoding fails.
 */
+ (BOOL)writeEarlyJsError:(FileSystemHelper *)fileSystemHelper name:(NSString *)name message:(NSString *)message stack:(NSString *)stack {
    @try {
        NSMutableDictionary *data = [NSMutableDictionary dictionary];
        [data setObject:name ?: @"Error" forKey:@"name"];
        [data setObject:message ?: @"" forKey:@"message"];
        [data setObject:stack ?: @"" forKey:@"stack"];
        [data setObject:@[] forKey:@"componentStack"];
        [data setObject:[NSNull null] forKey:@"digest"];
        [data setObject:[NSNull null] forKey:@"cause"];
        NSMutableDictionary *item = [NSMutableDictionary dictionary];
        [item setObject:@"JS_ERROR" forKey:@"action"];
        [item setObject:@((long long)([[NSDate date] timeIntervalSince1970] * 1000)) forKey:@"timestamp"];
        [item setObject:@"app" forKey:@"entity"];
        [item setObject:data forKey:@"data"];
        NSData *jsonData = [NSJSONSerialization dataWithJSONObject:item options:0 error:nil];
        if (!jsonData) return NO;
        NSString *line = [[[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding] stringByAppendingString:@"\n"];
        [fileSystemHelper appendFile:@"protocol.sherlo" content:line];
        return YES;
    } @catch (NSException *) {
        return NO;
    }
}

@end
