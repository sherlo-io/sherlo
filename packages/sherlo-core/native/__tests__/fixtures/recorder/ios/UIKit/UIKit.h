// The recorder's UIKit: the one thing Pixelmatch.m reads from it is a UIImage's CGImage, and
// CoreGraphics is the same on macOS. record.m implements it.
#import <CoreGraphics/CoreGraphics.h>
#import <Foundation/Foundation.h>

@interface UIImage : NSObject
@property(nonatomic, readonly) CGImageRef CGImage;
- (instancetype)initWithCGImage:(CGImageRef)image;
@end
