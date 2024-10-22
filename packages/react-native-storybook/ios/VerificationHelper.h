#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

@interface VerificationHelper : NSObject

+ (void)verifyIntegrationWithMode:(NSString *)mode
                 syncDirectoryPath:(NSString *)syncDirectoryPath;

@end
