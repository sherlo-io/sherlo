#import <Foundation/Foundation.h>

@interface FileSystemHelper : NSObject

+ (NSError *)mkdir:(NSString *)path;
+ (NSError *)appendFile:(NSString *)filepath contents:(NSString *)base64Content;
+ (NSString *)readFile:(NSString *)filepath error:(NSError **)error;

@end
