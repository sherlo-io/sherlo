#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

@interface Pixelmatch : NSObject

// Compare two equally sized UIImages and count the number of pixels that differ.
// threshold: sensitivity from 0.0 to 1.0 (smaller values = more sensitive).
// includeAA: if NO, anti-aliased pixels are ignored in the diff count.
+ (NSUInteger)pixelmatchImage:(UIImage *)img1 
                 againstImage:(UIImage *)img2 
                    threshold:(double)threshold 
                     includeAA:(BOOL)includeAA;

@end
