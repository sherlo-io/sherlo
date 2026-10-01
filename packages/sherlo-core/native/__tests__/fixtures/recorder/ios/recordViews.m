// The iOS half of the parity recorder for the views (record.m calls it):
//
// - The scroll engine of ios/SherloModuleCore.m, transcribed below: findBestScrollViewBFS's test of
//   each UIScrollView (its lines 497-524), isFrameworkInternalScrollView (538-545),
//   isScrollableByMetrics:epsilon: (564-594), validateWithNudge:nudgePx: (599-646) and
//   performScrollToCheckpoint (698-775), each run on scripted scroll views.
// - The inspector: the original InspectorHelper.m itself, run on a scripted view tree, its JSON
//   written by the real NSJSONSerialization.
//
// The scroll views, the windows and the screen are this file's stand-ins (ios/UIKit/UIKit.h).
#import <CoreGraphics/CoreGraphics.h>
#import <Foundation/Foundation.h>
#import <objc/runtime.h>

#import "InspectorHelper.h"
#import <React/UIView+React.h>
#import <UIKit/UIKit.h>

// ---- The stand-ins -------------------------------------------------------------------------------

@implementation UIView
- (instancetype)init {
  if ((self = [super init])) {
    _subviews = @[];
    _alpha = 1;
  }
  return self;
}
- (CGRect)convertRect:(CGRect)rect toView:(UIView *)view {
  return self.frameInWindow;
}
- (void)layoutIfNeeded {
}
@end

static const void *REACT_TAG_KEY = &REACT_TAG_KEY;

@implementation UIView (React)
- (NSNumber *)reactTag {
  return objc_getAssociatedObject(self, REACT_TAG_KEY);
}
- (void)setReactTag:(NSNumber *)reactTag {
  objc_setAssociatedObject(self, REACT_TAG_KEY, reactTag, OBJC_ASSOCIATION_COPY_NONATOMIC);
}
@end

@implementation UIViewController
@end

@implementation UIWindow
@end

@implementation UIScene
@end

@implementation UIWindowScene
@end

@implementation UIApplication
+ (UIApplication *)sharedApplication {
  static UIApplication *application;
  if (!application) application = [[UIApplication alloc] init];
  return application;
}
@end

@implementation UIScreen
+ (UIScreen *)mainScreen {
  static UIScreen *screen;
  if (!screen) screen = [[UIScreen alloc] init];
  return screen;
}
@end

UIFontTextStyle const UIFontTextStyleBody = @"UICTFontTextStyleBody";
static CGFloat scriptedBodyPointSize = 17;
static CGFloat scriptedSystemFontSize = 17;

@implementation UIFont
+ (UIFont *)preferredFontForTextStyle:(UIFontTextStyle)style {
  UIFont *font = [[UIFont alloc] init];
  font.pointSize = scriptedBodyPointSize;
  return font;
}
+ (CGFloat)systemFontSize {
  return scriptedSystemFontSize;
}
@end

// Every offset the glue set, and where the scroll view kept it, in the recorder's words.
static NSMutableArray<NSString *> *offsetsSet;

static NSString *number(double value) {
  if (isnan(value)) return @"NaN";
  if (isinf(value)) return value > 0 ? @"Infinity" : @"-Infinity";
  return [NSString stringWithFormat:@"%.17g", value];
}

@implementation UIScrollView
- (void)setContentOffset:(CGPoint)offset animated:(BOOL)animated {
  CGFloat kept = offset.y;
  if (kept < self.lowestReachableOffset) kept = self.lowestReachableOffset;
  if (kept > self.highestReachableOffset) kept = self.highestReachableOffset;
  _contentOffset = CGPointMake(offset.x, kept);
  [offsetsSet addObject:[NSString stringWithFormat:@"%@>%@", number(offset.y), number(kept)]];
}
@end

// ---- Reading the script --------------------------------------------------------------------------

static double nextNumber(FILE *input) {
  char word[64];
  if (fscanf(input, "%63s", word) != 1) {
    fprintf(stderr, "recordViews: the script ended early\n");
    exit(1);
  }
  return strtod(word, NULL);
}

static NSString *nextHexString(FILE *input) {
  static char hex[4096];
  if (fscanf(input, "%4095s", hex) != 1) exit(1);
  NSMutableData *bytes = [NSMutableData data];
  for (size_t index = 0; hex[index] && hex[index + 1]; index += 2) {
    unsigned int byte = 0;
    sscanf(hex + index, "%2x", &byte);
    uint8_t value = (uint8_t)byte;
    [bytes appendBytes:&value length:1];
  }
  return [[NSString alloc] initWithData:bytes encoding:NSUTF8StringEncoding];
}

// A class of this name, made the first time it is asked for, under `superclass`.
static Class classNamed(NSString *name, Class superclass) {
  Class existing = NSClassFromString(name);
  if (existing) return existing;
  Class made = objc_allocateClassPair(superclass, name.UTF8String, 0);
  objc_registerClassPair(made);
  return made;
}

// "scrollEnabled inWindow viewportHeight contentHeight insetTop insetBottom"
static UIScrollView *nextScrollView(FILE *input, Class viewClass, UIWindow *window) {
  UIScrollView *scrollView = [[viewClass alloc] init];
  scrollView.scrollEnabled = nextNumber(input) != 0;
  scrollView.window = nextNumber(input) != 0 ? window : nil;
  CGFloat viewportHeight = nextNumber(input);
  scrollView.bounds = CGRectMake(0, 0, 100, viewportHeight);
  scrollView.contentSize = CGSizeMake(100, nextNumber(input));
  UIEdgeInsets insets = {0, 0, 0, 0};
  insets.top = nextNumber(input);
  insets.bottom = nextNumber(input);
  scrollView.adjustedContentInset = insets;
  return scrollView;
}

// ---- The scroll engine, transcribed --------------------------------------------------------------

static BOOL isFrameworkInternalScrollView(UIScrollView *scrollView) {
  NSString *className = NSStringFromClass([scrollView class]);
  // Apple private classes use underscore prefix
  if ([className hasPrefix:@"_"]) {
    return YES;
  }
  return NO;
}

static BOOL isScrollableByMetrics(UIScrollView *scrollView, CGFloat epsilon) {
  if (!scrollView.isScrollEnabled) {
    return NO;
  }

  CGFloat viewportH = scrollView.bounds.size.height;
  CGFloat contentH = scrollView.contentSize.height;
  UIEdgeInsets insets = scrollView.adjustedContentInset;
  CGFloat totalInsets = insets.top + insets.bottom;
  CGFloat scrollRange = contentH + totalInsets - viewportH;

  // Basic checks
  if (viewportH <= 0) {
    return NO;
  }
  if (scrollRange <= epsilon) {
    return NO;
  }

  // Check if in window and visible
  if (!scrollView.window) {
    return NO;
  }

  return YES;
}

// findBestScrollViewBFS, for the UIScrollViews its walk met, in that order.
static NSInteger pickScrollView(UIWindow *window, NSArray<UIScrollView *> *candidates) {
  CGFloat screenArea = window.bounds.size.width * window.bounds.size.height;
  CGFloat minArea = screenArea * 0.10;

  for (NSUInteger index = 0; index < candidates.count; index++) {
    UIScrollView *sv = candidates[index];

    // Must be visible, scroll-enabled, and in window
    if (sv.hidden || sv.alpha < 0.01 || !sv.isScrollEnabled || !sv.window) {
      // Skip but still traverse children
    } else if (isFrameworkInternalScrollView(sv)) {
    } else if (isScrollableByMetrics(sv, 1.0)) {
      // Check minimum area - skip tiny scrollable views (toasts, badges, etc.)
      CGRect frameInWindow = [sv convertRect:sv.bounds toView:window];
      CGRect visible = CGRectIntersection(frameInWindow, window.bounds);
      CGFloat area = CGRectIsNull(visible) ? 0 : visible.size.width * visible.size.height;

      if (area < minArea) {
      } else {
        return (NSInteger)index;
      }
    }
  }
  return -1;
}

static BOOL validateWithNudge(UIScrollView *scrollView, CGFloat nudgePx) {
  CGFloat viewportH = scrollView.bounds.size.height;
  CGFloat contentH = scrollView.contentSize.height;
  UIEdgeInsets insets = scrollView.adjustedContentInset;

  CGFloat minY = -insets.top;
  CGFloat maxY = contentH - viewportH + insets.bottom;

  CGFloat originalOffsetY = scrollView.contentOffset.y;
  CGFloat targetY = originalOffsetY + nudgePx;

  // Clamp target
  targetY = MAX(minY, MIN(maxY, targetY));

  // If at clamp limit, try opposite direction
  if (fabs(targetY - originalOffsetY) < 1.0) {
    targetY = originalOffsetY - nudgePx;
    targetY = MAX(minY, MIN(maxY, targetY));
  }

  // If still can't move, fail
  if (fabs(targetY - originalOffsetY) < 1.0) {
    return NO;
  }

  // Apply nudge
  [scrollView setContentOffset:CGPointMake(scrollView.contentOffset.x, targetY) animated:NO];
  [scrollView layoutIfNeeded];

  // Read back
  CGFloat appliedOffsetY = scrollView.contentOffset.y;

  // Restore immediately
  [scrollView setContentOffset:CGPointMake(scrollView.contentOffset.x, originalOffsetY) animated:NO];
  [scrollView layoutIfNeeded];

  CGFloat delta = fabs(appliedOffsetY - originalOffsetY);
  return delta >= 1.0;
}

static NSDictionary *performScrollToCheckpoint(UIScrollView *candidate, CGFloat scale, NSInteger index,
                                               double offsetPx, NSInteger maxIndex) {
  // 2. Compute Metrics
  CGFloat viewportPt = candidate.bounds.size.height;
  CGFloat contentPt = candidate.contentSize.height;
  CGFloat insetsTop = candidate.adjustedContentInset.top;
  CGFloat insetsBottom = candidate.adjustedContentInset.bottom;

  CGFloat minOffsetPt = -insetsTop;
  CGFloat maxAvailableScrollPt = MAX(0, contentPt + insetsBottom + insetsTop - viewportPt);
  CGFloat maxOffsetPt = minOffsetPt + maxAvailableScrollPt;

  // 3. Convert Offset Units
  CGFloat stepPt = offsetPx / scale;

  // 4. Calculate Target
  NSInteger clampedIndex = index;
  if (clampedIndex < 0) clampedIndex = 0;
  if (clampedIndex > maxIndex) clampedIndex = maxIndex;

  CGFloat targetPt;
  if (clampedIndex == 0) {
    targetPt = minOffsetPt;  // Force top
  } else {
    targetPt = minOffsetPt + (clampedIndex * stepPt);
  }

  // Clamp target to valid bounds
  CGFloat clampedPt = MAX(minOffsetPt, MIN(maxOffsetPt, targetPt));

  // 5. Apply Scroll
  [candidate setContentOffset:CGPointMake(candidate.contentOffset.x, clampedPt) animated:NO];
  [candidate layoutIfNeeded];

  // 6. Read Back
  CGFloat actualOffsetPt = candidate.contentOffset.y;
  CGFloat scrolledDistancePt = actualOffsetPt - minOffsetPt;
  CGFloat scrolledDistancePx = scrolledDistancePt * scale;

  // 7. Detect Bottom
  CGFloat epsilonPt = 2.0 / scale;  // ~2px tolerance
  BOOL reachedBottom = NO;
  if (actualOffsetPt >= maxOffsetPt - epsilonPt) {
    reachedBottom = YES;
  }
  if (maxAvailableScrollPt <= epsilonPt) {
    reachedBottom = YES;
  }

  return @{
    @"reachedBottom" : @(reachedBottom),
    @"appliedIndex" : @(clampedIndex),
    @"appliedOffsetPx" : @(scrolledDistancePx),
    @"viewportPx" : @(viewportPt * scale),
    @"contentPx" : @(contentPt * scale),
  };
}

// ---- The scroll cases ----------------------------------------------------------------------------
//
// One case a line, its first word naming it:
//   pick <window width> <window height> <count>, then for each UIScrollView the walk met:
//        <class name, hex> <hidden> <alpha> <scroll view> <frame x y width height in the window>
//   check <scroll view>
//   nudge <scroll view> <offset> <lowest reachable offset> <highest reachable offset>
//   checkpoint <scroll view> <scale> <index> <offset px> <max index> <lowest reachable>
//              <highest reachable>
// where <scroll view> is "scrollEnabled inWindow viewportHeight contentHeight insetTop insetBottom".
// Each answers one line:
//   pick: the index picked (-1 for none), then for each candidate what CGRectIntersection made of
//         its frame and the window: "null", or its width and height.
//   check: 1 or 0.
//   nudge: 1 or 0, then each offset set, as "<asked>><kept>".
//   checkpoint: each offset set, then "|", then reachedBottom appliedIndex appliedOffsetPx
//               viewportPx contentPx.
void recordIosScrollCases(const char *file) {
  FILE *input = fopen(file, "r");
  char kind[32];
  while (fscanf(input, "%31s", kind) == 1) {
    @autoreleasepool {
      offsetsSet = [NSMutableArray array];
      UIWindow *window = [[UIWindow alloc] init];

      if (strcmp(kind, "pick") == 0) {
        CGFloat windowWidth = nextNumber(input);
        CGFloat windowHeight = nextNumber(input);
        window.bounds = CGRectMake(0, 0, windowWidth, windowHeight);
        int count = (int)nextNumber(input);
        NSMutableArray<UIScrollView *> *candidates = [NSMutableArray array];
        for (int index = 0; index < count; index++) {
          NSString *className = nextHexString(input);
          BOOL hidden = nextNumber(input) != 0;
          CGFloat alpha = nextNumber(input);
          UIScrollView *scrollView =
              nextScrollView(input, classNamed(className, [UIScrollView class]), window);
          scrollView.hidden = hidden;
          scrollView.alpha = alpha;
          CGFloat x = nextNumber(input), y = nextNumber(input);
          CGFloat width = nextNumber(input), height = nextNumber(input);
          scrollView.frameInWindow = CGRectMake(x, y, width, height);
          [candidates addObject:scrollView];
        }
        NSMutableArray<NSString *> *words = [NSMutableArray array];
        [words addObject:[NSString stringWithFormat:@"%ld", (long)pickScrollView(window, candidates)]];
        for (UIScrollView *scrollView in candidates) {
          CGRect visible = CGRectIntersection(scrollView.frameInWindow, window.bounds);
          if (CGRectIsNull(visible)) {
            [words addObject:@"null"];
          } else {
            [words addObject:[NSString stringWithFormat:@"%@ %@", number(visible.size.width),
                                                        number(visible.size.height)]];
          }
        }
        printf("%s\n", [words componentsJoinedByString:@" "].UTF8String);
      } else if (strcmp(kind, "check") == 0) {
        UIScrollView *scrollView = nextScrollView(input, [UIScrollView class], window);
        printf("%d\n", isScrollableByMetrics(scrollView, 4.0) ? 1 : 0);
      } else if (strcmp(kind, "nudge") == 0) {
        UIScrollView *scrollView = nextScrollView(input, [UIScrollView class], window);
        scrollView.contentOffset = CGPointMake(0, nextNumber(input));
        scrollView.lowestReachableOffset = nextNumber(input);
        scrollView.highestReachableOffset = nextNumber(input);
        BOOL moved = validateWithNudge(scrollView, 3.0);
        NSMutableArray<NSString *> *words = [NSMutableArray arrayWithObject:moved ? @"1" : @"0"];
        [words addObjectsFromArray:offsetsSet];
        printf("%s\n", [words componentsJoinedByString:@" "].UTF8String);
      } else if (strcmp(kind, "checkpoint") == 0) {
        UIScrollView *scrollView = nextScrollView(input, [UIScrollView class], window);
        CGFloat scale = nextNumber(input);
        NSInteger index = (NSInteger)nextNumber(input);
        double offsetPx = nextNumber(input);
        NSInteger maxIndex = (NSInteger)nextNumber(input);
        scrollView.lowestReachableOffset = nextNumber(input);
        scrollView.highestReachableOffset = nextNumber(input);
        NSDictionary *result = performScrollToCheckpoint(scrollView, scale, index, offsetPx, maxIndex);
        NSMutableArray<NSString *> *words = [NSMutableArray arrayWithArray:offsetsSet];
        [words addObject:@"|"];
        [words addObject:[result[@"reachedBottom"] boolValue] ? @"1" : @"0"];
        [words addObject:[NSString stringWithFormat:@"%ld", (long)[result[@"appliedIndex"] integerValue]]];
        [words addObject:number([result[@"appliedOffsetPx"] doubleValue])];
        [words addObject:number([result[@"viewportPx"] doubleValue])];
        [words addObject:number([result[@"contentPx"] doubleValue])];
        printf("%s\n", [words componentsJoinedByString:@" "].UTF8String);
      } else {
        fprintf(stderr, "recordViews: unknown scroll case %s\n", kind);
        exit(1);
      }
    }
  }
  fclose(input);
}

// ---- The inspector trees -------------------------------------------------------------------------

@interface InspectorHelper (Recorded)
+ (NSString *)dumpBoundaries:(NSError **)error;
@end

// One tree a line:
//   <window height> <nativeScale> <body font size> <system font size> <count>, then for each view
//   in pre-order: <depth> <class name, hex> <hidden> <alpha> <in window>
//   <frame x y width height in the window> <reactTag, or -> <tag>
// Each answers one line: the JSON dumpBoundaries wrote, in hex, or "error <code>".
void recordIosInspectorTrees(const char *file) {
  FILE *input = fopen(file, "r");
  char word[64];
  while (fscanf(input, "%63s", word) == 1) {
    @autoreleasepool {
      UIWindow *window = [[UIWindow alloc] init];
      window.bounds = CGRectMake(0, 0, 400, strtod(word, NULL));
      [UIScreen mainScreen].nativeScale = nextNumber(input);
      scriptedBodyPointSize = nextNumber(input);
      scriptedSystemFontSize = nextNumber(input);
      int count = (int)nextNumber(input);

      // The views at each depth on the way down to the latest one.
      NSMutableArray<UIView *> *ancestors = [NSMutableArray array];
      UIView *root = nil;
      for (int index = 0; index < count; index++) {
        int depth = (int)nextNumber(input);
        UIView *view = [[classNamed(nextHexString(input), [UIView class]) alloc] init];
        view.hidden = nextNumber(input) != 0;
        view.alpha = nextNumber(input);
        view.window = nextNumber(input) != 0 ? window : nil;
        CGFloat x = nextNumber(input), y = nextNumber(input);
        CGFloat width = nextNumber(input), height = nextNumber(input);
        view.frameInWindow = CGRectMake(x, y, width, height);
        char reactTag[64];
        fscanf(input, "%63s", reactTag);
        if (strcmp(reactTag, "-") != 0) view.reactTag = @(strtoll(reactTag, NULL, 10));
        view.tag = (NSInteger)nextNumber(input);

        while ((int)ancestors.count > depth) [ancestors removeLastObject];
        if (depth == 0) {
          root = view;
        } else {
          UIView *parent = ancestors.lastObject;
          parent.subviews = [parent.subviews arrayByAddingObject:view];
        }
        [ancestors addObject:view];
      }

      UIViewController *controller = [[UIViewController alloc] init];
      controller.view = root;
      window.rootViewController = controller;
      UIWindowScene *scene = [[UIWindowScene alloc] init];
      scene.windows = @[ window ];
      [UIApplication sharedApplication].connectedScenes = [NSSet setWithObject:scene];

      NSError *error = nil;
      NSString *json = [InspectorHelper dumpBoundaries:&error];
      if (!json) {
        printf("error %ld\n", (long)error.code);
      } else {
        NSData *bytes = [json dataUsingEncoding:NSUTF8StringEncoding];
        const uint8_t *data = bytes.bytes;
        for (NSUInteger index = 0; index < bytes.length; index++) printf("%02x", data[index]);
        printf("\n");
      }
    }
  }
  fclose(input);
}
