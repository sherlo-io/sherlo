#import <Foundation/Foundation.h>

@class FileSystemHelper;

@interface ProtocolHelper : NSObject

+ (void)writeNativeInitStarted:(FileSystemHelper *)fileSystemHelper;
+ (void)writeNativeLoaded:(FileSystemHelper *)fileSystemHelper requestId:(NSString *)requestId;
+ (void)writeNativeInitComplete:(FileSystemHelper *)fileSystemHelper;
+ (void)writeNativeError:(FileSystemHelper *)fileSystemHelper errorCode:(NSString *)errorCode message:(NSString *)message dataJson:(NSString *)dataJson;

@end
