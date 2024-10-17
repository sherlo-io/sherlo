#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

@interface InspectorHelper : NSObject

+ (NSString *)dumpBoundaries:(UIView *)rootView error:(NSError **)error;

@end
