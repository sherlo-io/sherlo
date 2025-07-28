#import "Pixelmatch.h"
#import <CoreGraphics/CoreGraphics.h>
#import <math.h>

// Helper: Compute color difference between two 32-bit ARGB pixels in YIQ color space.
static double colorDelta(uint32_t pixel1, uint32_t pixel2, BOOL yOnly, NSUInteger index1) {
    // Extract components (A, R, G, B)
    uint8_t a1 = (pixel1 >> 24) & 0xFF;
    uint8_t r1 = (pixel1 >> 16) & 0xFF;
    uint8_t g1 = (pixel1 >> 8) & 0xFF;
    uint8_t b1 = pixel1 & 0xFF;
    uint8_t a2 = (pixel2 >> 24) & 0xFF;
    uint8_t r2 = (pixel2 >> 16) & 0xFF;
    uint8_t g2 = (pixel2 >> 8) & 0xFF;
    uint8_t b2 = pixel2 & 0xFF;

    if (a1 == a2 && r1 == r2 && g1 == g2 && b1 == b2) {
        return 0.0;
    }

    // Base differences
    double dr = (double)r1 - r2;
    double dg = (double)g1 - g2;
    double db = (double)b1 - b2;
    double da = (double)a1 - a2;

    // If either pixel is semi-transparent, blend with a consistent background
    if (a1 < 255 || a2 < 255) {
        uint64_t k = (uint64_t)index1 * 4ULL;
        double rb = 48.0 + 159.0 * (double)(k % 2ULL);
        double gb = 48.0 + 159.0 * (double)(((long long)floor(k / 1.618033988749895)) % 2LL);
        double bb = 48.0 + 159.0 * (double)(((long long)floor(k / 2.618033988749895)) % 2LL);
        // Composite both pixels over the background color
        dr = ((double)r1 * a1 - (double)r2 * a2 - rb * da) / 255.0;
        dg = ((double)g1 * a1 - (double)g2 * a2 - gb * da) / 255.0;
        db = ((double)b1 * a1 - (double)b2 * a2 - bb * da) / 255.0;
    }

    // Luminance (Y) difference
    double y = dr * 0.29889531 + dg * 0.58662247 + db * 0.11448223;
    if (yOnly) {
        return y;
    }
    // Chrominance differences (I and Q)
    double i = dr * 0.59597799 - dg * 0.27417610 - db * 0.32180189;
    double q = dr * 0.21147017 - dg * 0.52261711 + db * 0.31114694;
    // Combined perceptual color difference
    double delta = 0.5053 * y * y + 0.2990 * i * i + 0.1957 * q * q;
    return (y > 0) ? -delta : delta;
}

// Helper: Check if a pixel at (x, y) in an image (mainPixels) is anti-aliased.
static BOOL hasManySiblings(const uint32_t *pixels, int x, int y, NSUInteger width, NSUInteger height) {
    uint32_t center = pixels[(NSUInteger)y * width + x];
    int x0 = (x > 0) ? x - 1 : x;
    int y0 = (y > 0) ? y - 1 : y;
    int x2 = (x < (int)width - 1) ? x + 1 : x;
    int y2 = (y < (int)height - 1) ? y + 1 : y;

    int count = 0;
    if (x == x0 || x == x2 || y == y0 || y == y2) {
        count = 1;
    }
    for (int ny = y0; ny <= y2; ny++) {
        for (int nx = x0; nx <= x2; nx++) {
            if (nx == x && ny == y) continue;
            if (pixels[(NSUInteger)ny * width + nx] == center) {
                if (++count > 2) {
                    return YES;
                }
            }
        }
    }
    return NO;
}

static BOOL isAntiAliased(const uint32_t *mainPixels, int x, int y, NSUInteger width, NSUInteger height, const uint32_t *otherPixels) {
    NSUInteger idx = (NSUInteger)y * width + x;
    uint32_t centerPixel = mainPixels[idx];

    // Neighbor bounds
    int x0 = (x > 0) ? x - 1 : x;
    int y0 = (y > 0) ? y - 1 : y;
    int x2 = (x < (int)width - 1) ? x + 1 : x;
    int y2 = (y < (int)height - 1) ? y + 1 : y;

    int identicalCount = 0;
    if (x == x0 || x == x2 || y == y0 || y == y2) {
        identicalCount = 1;
    }

    double minYDiff = 0.0, maxYDiff = 0.0;
    int minX = x, minY = y;
    int maxX = x, maxY = y;

    // Compare center pixel with neighbors in mainPixels
    for (int ny = y0; ny <= y2; ny++) {
        for (int nx = x0; nx <= x2; nx++) {
            if (nx == x && ny == y) continue;
            NSUInteger nIndex = (NSUInteger)ny * width + nx;
            double yDelta = colorDelta(centerPixel, mainPixels[nIndex], YES, idx);
            if (yDelta == 0.0) {
                if (++identicalCount > 2) {
                    return NO;
                }
            } else if (yDelta < minYDiff) {
                minYDiff = yDelta;
                minX = nx;
                minY = ny;
            } else if (yDelta > maxYDiff) {
                maxYDiff = yDelta;
                maxX = nx;
                maxY = ny;
            }
        }
    }

    if (minYDiff == 0.0 || maxYDiff == 0.0) {
        return NO;
    }

    // If both the most-similar and most-different neighbor pixels form flat regions in *both* images, treat as anti-aliased
    if (hasManySiblings(mainPixels, minX, minY, width, height) &&
        hasManySiblings(otherPixels, minX, minY, width, height)) {
        return YES;
    }
    if (hasManySiblings(mainPixels, maxX, maxY, width, height) &&
        hasManySiblings(otherPixels, maxX, maxY, width, height)) {
        return YES;
    }
    return NO;
}

@implementation Pixelmatch

+ (NSUInteger)pixelmatchImage:(UIImage *)img1 
                 againstImage:(UIImage *)img2 
                    threshold:(double)threshold 
                     includeAA:(BOOL)includeAA {
    if (!img1 || !img2) {
        @throw [NSException exceptionWithName:NSInvalidArgumentException 
                                       reason:@"Image data must not be nil." 
                                     userInfo:nil];
    }
    CGImageRef cg1 = img1.CGImage;
    CGImageRef cg2 = img2.CGImage;
    NSUInteger width = CGImageGetWidth(cg1);
    NSUInteger height = CGImageGetHeight(cg1);
    if (width != CGImageGetWidth(cg2) || height != CGImageGetHeight(cg2)) {
        NSString *reason = [NSString stringWithFormat:
            @"Image sizes do not match. Image1: %lux%lu, Image2: %lux%lu",
            (unsigned long)width, (unsigned long)height, 
            (unsigned long)CGImageGetWidth(cg2), (unsigned long)CGImageGetHeight(cg2)];
        @throw [NSException exceptionWithName:NSInvalidArgumentException reason:reason userInfo:nil];
    }

    // Set up a bitmap context for RGBA pixels
    size_t bytesPerRow = width * 4;
    size_t totalBytes = bytesPerRow * height;
    unsigned char *rawData = malloc(totalBytes);
    if (!rawData) {
        @throw [NSException exceptionWithName:NSInternalInconsistencyException 
                                       reason:@"Failed to allocate memory for image data." 
                                     userInfo:nil];
    }
    CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
    CGContextRef context = CGBitmapContextCreate(rawData, width, height, 8, bytesPerRow, colorSpace,
                                                kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);
    CGColorSpaceRelease(colorSpace);
    if (!context) {
        free(rawData);
        @throw [NSException exceptionWithName:NSInternalInconsistencyException 
                                       reason:@"Failed to create bitmap context." 
                                     userInfo:nil];
    }

    // Draw first image into the context
    CGContextDrawImage(context, CGRectMake(0, 0, width, height), cg1);
    NSUInteger totalPixels = width * height;
    uint32_t *pixels1 = malloc(totalPixels * sizeof(uint32_t));
    if (!pixels1) {
        CGContextRelease(context);
        free(rawData);
        @throw [NSException exceptionWithName:NSInternalInconsistencyException 
                                       reason:@"Memory allocation failed." 
                                     userInfo:nil];
    }
    // Convert premultiplied RGBA to straight ARGB for image1
    for (NSUInteger i = 0; i < totalPixels; i++) {
        unsigned char *p = rawData + i * 4;
        uint8_t r = p[0], g = p[1], b = p[2], a = p[3];
        uint8_t origR = r, origG = g, origB = b;
        if (a != 0 && a != 255) {
            // Un-premultiply color channels
            origR = (uint8_t)MIN(lround((double)r * 255.0 / a), 255);
            origG = (uint8_t)MIN(lround((double)g * 255.0 / a), 255);
            origB = (uint8_t)MIN(lround((double)b * 255.0 / a), 255);
        }
        pixels1[i] = ((uint32_t)a << 24) | ((uint32_t)origR << 16) | ((uint32_t)origG << 8) | origB;
    }

    // Draw second image and similarly convert to ARGB
    CGContextClearRect(context, CGRectMake(0, 0, width, height));
    CGContextDrawImage(context, CGRectMake(0, 0, width, height), cg2);
    uint32_t *pixels2 = malloc(totalPixels * sizeof(uint32_t));
    if (!pixels2) {
        free(pixels1);
        CGContextRelease(context);
        free(rawData);
        @throw [NSException exceptionWithName:NSInternalInconsistencyException 
                                       reason:@"Memory allocation failed." 
                                     userInfo:nil];
    }
    for (NSUInteger i = 0; i < totalPixels; i++) {
        unsigned char *p = rawData + i * 4;
        uint8_t r = p[0], g = p[1], b = p[2], a = p[3];
        uint8_t origR = r, origG = g, origB = b;
        if (a != 0 && a != 255) {
            origR = (uint8_t)MIN(lround((double)r * 255.0 / a), 255);
            origG = (uint8_t)MIN(lround((double)g * 255.0 / a), 255);
            origB = (uint8_t)MIN(lround((double)b * 255.0 / a), 255);
        }
        pixels2[i] = ((uint32_t)a << 24) | ((uint32_t)origR << 16) | ((uint32_t)origG << 8) | origB;
    }

    // Clean up the context and raw buffer
    CGContextRelease(context);
    free(rawData);

    // Quick check for identical images
    BOOL identical = YES;
    for (NSUInteger i = 0; i < totalPixels; i++) {
        if (pixels1[i] != pixels2[i]) {
            identical = NO;
            break;
        }
    }
    if (identical) {
        free(pixels1);
        free(pixels2);
        return 0;
    }

    double maxDelta = 35215.0 * threshold * threshold;
    NSUInteger diffCount = 0;
    // Compare each pixel with threshold and anti-alias filter
    for (NSUInteger y = 0; y < height; y++) {
        for (NSUInteger x = 0; x < width; x++) {
            NSUInteger idx = y * width + x;
            if (pixels1[idx] == pixels2[idx]) {
                continue;
            }
            double delta = colorDelta(pixels1[idx], pixels2[idx], NO, idx);
            if (fabs(delta) > maxDelta) {
                BOOL exclude = NO;
                if (!includeAA) {
                    if (isAntiAliased(pixels1, (int)x, (int)y, width, height, pixels2) ||
                        isAntiAliased(pixels2, (int)x, (int)y, width, height, pixels1)) {
                        exclude = YES;
                    }
                }
                if (!exclude) {
                    diffCount++;
                }
            }
        }
    }

    free(pixels1);
    free(pixels2);
    return diffCount;
}

@end
