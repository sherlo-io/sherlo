// The iOS half of the parity recorder (record.js runs it): the original Pixelmatch.m answers each
// pixel compare, and the stillness loop of ios/StabilityHelper.m (its lines 63-119, transcribed
// below) decides each scripted timeline.
//
// Usage: record <pixel-compare.txt> <stillness.txt>. Prints one answer line per pixel compare,
// a line "---", then one line of verdicts per stillness timeline.
#import <CoreGraphics/CoreGraphics.h>
#import <Foundation/Foundation.h>

#import "Pixelmatch.h"

@implementation UIImage {
  CGImageRef _image;
}
- (instancetype)initWithCGImage:(CGImageRef)image {
  if ((self = [super init])) _image = CGImageRetain(image);
  return self;
}
- (CGImageRef)CGImage {
  return _image;
}
- (void)dealloc {
  CGImageRelease(_image);
}
@end

static CGContextRef premultipliedContext(void *bytes, size_t width, size_t height) {
  CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
  CGContextRef context =
      CGBitmapContextCreate(bytes, width, height, 8, width * 4, colorSpace,
                            kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);
  CGColorSpaceRelease(colorSpace);
  return context;
}

// A UIImage holding exactly these premultiplied RGBA bytes: the bitmap the screenshot was.
static UIImage *imageFromPremultiplied(NSData *bytes, size_t width, size_t height) {
  CGDataProviderRef provider = CGDataProviderCreateWithCFData((__bridge CFDataRef)[bytes copy]);
  CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
  CGImageRef cgImage =
      CGImageCreate(width, height, 8, 32, width * 4, colorSpace,
                    kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big, provider, NULL,
                    false, kCGRenderingIntentDefault);
  CGColorSpaceRelease(colorSpace);
  CGDataProviderRelease(provider);
  UIImage *image = [[UIImage alloc] initWithCGImage:cgImage];
  CGImageRelease(cgImage);

  // Pixelmatch.m draws the image into a context like this one: the bytes it reads must be ours.
  NSMutableData *drawn = [NSMutableData dataWithLength:width * height * 4];
  CGContextRef check = premultipliedContext(drawn.mutableBytes, width, height);
  CGContextDrawImage(check, CGRectMake(0, 0, width, height), image.CGImage);
  CGContextRelease(check);
  if (![drawn isEqualToData:bytes]) {
    fprintf(stderr, "record: CoreGraphics changed the bytes of a %zux%zu image\n", width, height);
    exit(1);
  }
  return image;
}

static NSData *dataFromHex(const char *hex) {
  size_t length = strlen(hex) / 2;
  NSMutableData *data = [NSMutableData dataWithLength:length];
  uint8_t *bytes = data.mutableBytes;
  for (size_t index = 0; index < length; index++) {
    unsigned int byte = 0;
    sscanf(hex + index * 2, "%2x", &byte);
    bytes[index] = (uint8_t)byte;
  }
  return data;
}

static NSData *solidBytes(size_t width, size_t height, uint8_t grey) {
  NSMutableData *data = [NSMutableData dataWithLength:width * height * 4];
  uint8_t *bytes = data.mutableBytes;
  for (size_t index = 0; index < width * height; index++) {
    bytes[index * 4] = grey;
    bytes[index * 4 + 1] = grey;
    bytes[index * 4 + 2] = grey;
    bytes[index * 4 + 3] = 255;
  }
  return data;
}

static void recordPixelCompares(const char *file) {
  FILE *input = fopen(file, "r");
  char *hexA = malloc(1 << 22), *hexB = malloc(1 << 22);
  size_t widthA, heightA, widthB, heightB;
  double threshold;
  int includeAA;
  while (fscanf(input, "%zu %zu %zu %zu %lf %d %s %s", &widthA, &heightA, &widthB, &heightB,
                &threshold, &includeAA, hexA, hexB) == 8) {
    @autoreleasepool {
      UIImage *a = imageFromPremultiplied(dataFromHex(hexA), widthA, heightA);
      UIImage *b = imageFromPremultiplied(dataFromHex(hexB), widthB, heightB);
      @try {
        NSUInteger different = [Pixelmatch pixelmatchImage:a
                                               againstImage:b
                                                  threshold:threshold
                                                  includeAA:includeAA];
        printf("%lu\n", (unsigned long)different);
      } @catch (NSException *exception) {
        printf("%s\n", [exception.reason containsString:@"sizes do not match"] ? "size-mismatch"
                                                                              : "threw");
      }
    }
  }
  fclose(input);
  free(hexA);
  free(hexB);
}

// One scripted timeline through the loop of ios/StabilityHelper.m. The timer, the screenshots and
// the clock are the script's; every decision line is the original's.
static void recordStillnessLoops(const char *file) {
  FILE *input = fopen(file, "r");
  double requiredMatches, minScreenshotsCount, timeoutMs, threshold;
  int includeAA;
  long long loopStartMs, firstShotDoneMs;
  int tickCount;
  UIImage *white = imageFromPremultiplied(solidBytes(2, 2, 255), 2, 2);
  UIImage *black = imageFromPremultiplied(solidBytes(2, 2, 0), 2, 2);
  UIImage *wider = imageFromPremultiplied(solidBytes(3, 2, 255), 3, 2);

  while (fscanf(input, "%lf %lf %lf %lf %d %lld %lld %d", &requiredMatches, &minScreenshotsCount,
                &timeoutMs, &threshold, &includeAA, &loopStartMs, &firstShotDoneMs,
                &tickCount) == 8) {
    NSMutableArray<NSString *> *verdicts = [NSMutableArray array];
    BOOL decided = NO;

    // The clock starts once the first screenshot is taken.
    long long startTime = firstShotDoneMs;
    NSInteger consecutiveMatches = 0;
    NSInteger screenshotCounter = 0;

    for (int tickIndex = 0; tickIndex < tickCount; tickIndex++) {
      long long tickMs, capturedMs, focusClearedMs;
      char pair[16];
      int focusCleared;
      fscanf(input, "%lld %lld %lld %15s %d", &tickMs, &capturedMs, &focusClearedMs, pair,
             &focusCleared);
      if (decided) continue;  // the timer was invalidated

      screenshotCounter++;
      NSInteger elapsedMs = (NSInteger)(tickMs - startTime);

      UIImage *lastScreenshot = white;
      UIImage *currentScreenshot = strcmp(pair, "differs") == 0 ? black
                                   : strcmp(pair, "size") == 0  ? wider
                                                                : white;
      NSUInteger differentPixels = 0;
      @try {
        differentPixels = [Pixelmatch pixelmatchImage:currentScreenshot
                                          againstImage:lastScreenshot
                                             threshold:threshold
                                             includeAA:includeAA];
      } @catch (NSException *exception) {
        // Thrown inside the timer's block: nothing catches it in the app.
        [verdicts addObject:@"throws"];
        decided = YES;
        continue;
      }

      BOOL imagesMatch = (differentPixels == 0);
      if (imagesMatch) {
        consecutiveMatches++;
      } else {
        consecutiveMatches = 0;
      }

      if (consecutiveMatches >= requiredMatches) {
        [verdicts addObject:@"stable"];
        decided = YES;
      } else if (elapsedMs >= timeoutMs && consecutiveMatches == 0 &&
                 screenshotCounter >= minScreenshotsCount) {
        [verdicts addObject:@"unstable"];
        decided = YES;
      } else {
        [verdicts addObject:@"continue"];
      }
    }
    printf("%s\n", [verdicts componentsJoinedByString:@" "].UTF8String);
  }
  fclose(input);
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    recordPixelCompares(argv[1]);
    printf("---\n");
    recordStillnessLoops(argv[2]);
  }
  return 0;
}
