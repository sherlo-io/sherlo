#import <Foundation/Foundation.h>

@class FileSystemHelper;

@interface ProtocolHelper : NSObject

+ (void)writeNativeLoaded:(FileSystemHelper *)fileSystemHelper requestId:(NSString *)requestId;
+ (void)writeNativeError:(FileSystemHelper *)fileSystemHelper errorCode:(NSString *)errorCode message:(NSString *)message dataJson:(NSString *)dataJson;

@end
