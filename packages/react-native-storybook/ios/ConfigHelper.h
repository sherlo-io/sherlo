#import <Foundation/Foundation.h>

@interface ConfigHelper : NSObject

+ (NSString *)getSyncDirectoryPath:(NSError **)error;
+ (NSDictionary *)loadConfig:(NSError **)error syncDirectoryPath:(NSString *)syncDirectoryPath;

@end
