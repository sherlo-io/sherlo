#import <Foundation/Foundation.h>

@class FileSystemHelper;

@interface ConfigHelper : NSObject

+ (NSDictionary *)loadConfig:(FileSystemHelper *)fileSystemHelper;
+ (NSString *)determineModeFromConfig:(NSDictionary *)config;

@end
