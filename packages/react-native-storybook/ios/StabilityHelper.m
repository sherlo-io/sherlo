#import "StabilityHelper.h"

/**
 * Helper for testing UI stability in a React Native application.
 * Provides functionality for comparing screenshots and determining if the UI has stabilized.
 */
@implementation StabilityHelper

/**
 * Returns a promise for checking UI stability by comparing screenshots.
 * Takes screenshots at specified intervals and compares them for pixel-by-pixel stability.
 *
 * @param delay The delay in milliseconds between stability checks
 * @param resolve Promise resolver to call with the stability result
 * @param reject Promise rejecter to call if an error occurs
 */
+ (void)stabilizeWithDelay:(nonnull NSNumber *)delay
                   resolve:(RCTPromiseResolveBlock)resolve
                    reject:(RCTPromiseRejectBlock)reject {
    
    // Dispatch to the main thread since we're dealing with UI
    dispatch_async(dispatch_get_main_queue(), ^{
        NSInteger delayMs = [delay integerValue];
        NSTimeInterval delaySeconds = delayMs / 1000.0;
        
        // Initial screenshot
        UIImage *previousScreenshot = [self takeScreenshot];
        
        if (!previousScreenshot) {
            reject(@"E_STABILITY", @"Failed to take initial screenshot", nil);
            return;
        }
        
        // Schedule the second screenshot after the delay
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(delaySeconds * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            UIImage *currentScreenshot = [self takeScreenshot];
            
            if (!currentScreenshot) {
                reject(@"E_STABILITY", @"Failed to take comparison screenshot", nil);
                return;
            }
            
            // Compare the two screenshots
            BOOL imagesAreEqual = [self compareImages:previousScreenshot withImage:currentScreenshot];
            resolve(@(imagesAreEqual));
        });
    });
}

/**
 * Takes a screenshot of the current screen.
 *
 * @return UIImage of the current screen or nil if screenshot fails
 */
+ (UIImage *)takeScreenshot {
    // Get the key window
    UIWindow *keyWindow = nil;
    NSArray *windows = [UIApplication sharedApplication].windows;
    for (UIWindow *window in windows) {
        if (window.isKeyWindow) {
            keyWindow = window;
            break;
        }
    }
    
    if (!keyWindow) {
        NSLog(@"Could not find key window for screenshot");
        return nil;
    }
    
    // Screenshot the window
    UIGraphicsBeginImageContextWithOptions(keyWindow.bounds.size, NO, 0.0);
    [keyWindow drawViewHierarchyInRect:keyWindow.bounds afterScreenUpdates:YES];
    UIImage *screenshot = UIGraphicsGetImageFromCurrentImageContext();
    UIGraphicsEndImageContext();
    
    return screenshot;
}

/**
 * Compares two images pixel by pixel to determine if they are identical.
 *
 * @param image1 First image to compare
 * @param image2 Second image to compare
 * @return YES if images are identical, NO otherwise
 */
+ (BOOL)compareImages:(UIImage *)image1 withImage:(UIImage *)image2 {
    // Check for nil images
    if (!image1 || !image2) {
        return NO;
    }
    
    // Check dimensions
    if (image1.size.width != image2.size.width || image1.size.height != image2.size.height) {
        return NO;
    }
    
    // Convert images to same format for comparison
    CGImageRef cgImage1 = image1.CGImage;
    CGImageRef cgImage2 = image2.CGImage;
    
    if (!cgImage1 || !cgImage2) {
        return NO;
    }
    
    // Get image data
    NSData *data1 = [self imageDataFromCGImage:cgImage1];
    NSData *data2 = [self imageDataFromCGImage:cgImage2];
    
    if (!data1 || !data2) {
        return NO;
    }
    
    // Compare data
    return [data1 isEqualToData:data2];
}

/**
 * Converts a CGImage to NSData for comparison.
 *
 * @param cgImage The CGImage to convert
 * @return NSData representation of the image or nil if conversion fails
 */
+ (NSData *)imageDataFromCGImage:(CGImageRef)cgImage {
    size_t width = CGImageGetWidth(cgImage);
    size_t height = CGImageGetHeight(cgImage);
    size_t bitsPerComponent = 8;
    size_t bytesPerRow = width * 4;
    
    uint8_t *data = (uint8_t *)calloc(height * bytesPerRow, sizeof(uint8_t));
    if (!data) {
        return nil;
    }
    
    CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
    CGContextRef context = CGBitmapContextCreate(data, 
                                                width, 
                                                height, 
                                                bitsPerComponent, 
                                                bytesPerRow, 
                                                colorSpace, 
                                                kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);
    
    CGColorSpaceRelease(colorSpace);
    
    if (!context) {
        free(data);
        return nil;
    }
    
    CGContextDrawImage(context, CGRectMake(0, 0, width, height), cgImage);
    CGContextRelease(context);
    
    NSData *result = [NSData dataWithBytes:data length:height * bytesPerRow];
    free(data);
    
    return result;
}

@end