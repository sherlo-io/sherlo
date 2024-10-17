#import <Foundation/Foundation.h>

@interface FileSystemHelper : NSObject

+ (void)mkdir:(NSString *)filepath error:(NSError **)error;
+ (void)appendFile:(NSString *)filepath contents:(NSString *)base64Content error:(NSError **)error;
+ (NSString *)readFile:(NSString *)filepath error:(NSError **)error;

@end
