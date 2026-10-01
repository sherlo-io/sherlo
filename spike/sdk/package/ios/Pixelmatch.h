#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

/**
 * Based on https://github.com/mapbox/pixelmatch v7.1.0
 * Created based on the ISC license. Copyright (c) 2025, Mapbox.
 */
 
@interface Pixelmatch : NSObject

// Compare two equally sized UIImages and count the number of pixels that differ.
// threshold: sensitivity from 0.0 to 1.0 (smaller values = more sensitive).
// includeAA: if NO, anti-aliased pixels are ignored in the diff count.
+ (NSUInteger)pixelmatchImage:(UIImage *)img1 
                 againstImage:(UIImage *)img2 
                    threshold:(double)threshold 
                     includeAA:(BOOL)includeAA;

@end
