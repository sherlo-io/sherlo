#import <Foundation/Foundation.h>

@class FileSystemHelper;

@interface ProtocolHelper : NSObject

+ (void)writeNativeInitStarted:(FileSystemHelper *)fileSystemHelper;
+ (void)writeNativeLoaded:(FileSystemHelper *)fileSystemHelper requestId:(NSString *)requestId;
+ (void)writeNativeError:(FileSystemHelper *)fileSystemHelper errorCode:(NSString *)errorCode message:(NSString *)message dataJson:(NSString *)dataJson;

/**
 * Writes a JS_ERROR JSON line to protocol.sherlo.
 * Called when the JS polyfill captures an uncaught JS error (globalHandler or
 * ErrorBoundary) while in testing mode.
 *
 * @param fileSystemHelper The file system helper
 * @param message The error message string
 * @param stack The JS stack trace string
 * @param source Either "globalHandler" or "errorBoundary"
 */
+ (void)writeJsError:(FileSystemHelper *)fileSystemHelper message:(NSString *)message stack:(NSString *)stack source:(NSString *)source;

/**
 * Writes a JS_ERROR JSON line with full payload for module-eval errors caught
 * by the metro __r polyfill. Returns YES on success, NO on encoding failure.
 */
+ (BOOL)writeEarlyJsError:(FileSystemHelper *)fileSystemHelper name:(NSString *)name message:(NSString *)message stack:(NSString *)stack;

@end
