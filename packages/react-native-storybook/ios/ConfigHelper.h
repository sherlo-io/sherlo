#import <Foundation/Foundation.h>

@class FileSystemHelper;

// Forward declarations for mode constants
extern NSString * const MODE_DEFAULT;
extern NSString * const MODE_STORYBOOK;
extern NSString * const MODE_TESTING;

@interface ConfigHelper : NSObject

+ (NSDictionary *)loadConfigWithFileSystemHelper:(FileSystemHelper *)fileSystemHelper;
+ (NSString *)determineModeFromConfig:(NSDictionary *)config;

@end
