// The recorder's UIKit: the few things the original Pixelmatch.m and InspectorHelper.m read from
// it, and the scroll view the transcribed scroll engine reads. CoreGraphics is the same on macOS.
// record.m implements every class here, each answering what the recorder scripts.
#import <CoreGraphics/CoreGraphics.h>
#import <Foundation/Foundation.h>

@interface UIImage : NSObject
@property(nonatomic, readonly) CGImageRef CGImage;
- (instancetype)initWithCGImage:(CGImageRef)image;
@end

typedef struct UIEdgeInsets {
  CGFloat top, left, bottom, right;
} UIEdgeInsets;

@class UIWindow;

@interface UIView : NSObject
@property(nonatomic, copy) NSArray<UIView *> *subviews;
@property(nonatomic) BOOL hidden;
@property(nonatomic) CGFloat alpha;
@property(nonatomic, weak) UIWindow *window;
@property(nonatomic) CGRect bounds;
@property(nonatomic) NSInteger tag;
/** The recorder's script: the view's frame in its window, which convertRect:toView: answers. */
@property(nonatomic) CGRect frameInWindow;
- (CGRect)convertRect:(CGRect)rect toView:(UIView *)view;
- (void)layoutIfNeeded;
@end

@interface UIViewController : NSObject
@property(nonatomic, strong) UIView *view;
@end

@interface UIWindow : UIView
@property(nonatomic, strong) UIViewController *rootViewController;
@end

@interface UIScene : NSObject
@end

@interface UIWindowScene : UIScene
@property(nonatomic, copy) NSArray<UIWindow *> *windows;
@end

@interface UIApplication : NSObject
@property(nonatomic, copy) NSSet<UIScene *> *connectedScenes;
@property(class, nonatomic, readonly) UIApplication *sharedApplication;
@end

@interface UIScreen : NSObject
@property(nonatomic) CGFloat nativeScale;
@property(class, nonatomic, readonly) UIScreen *mainScreen;
@end

typedef NSString *UIFontTextStyle;
extern UIFontTextStyle const UIFontTextStyleBody;

@interface UIFont : NSObject
@property(nonatomic) CGFloat pointSize;
+ (UIFont *)preferredFontForTextStyle:(UIFontTextStyle)style;
+ (CGFloat)systemFontSize;
@end

@interface UIScrollView : UIView
@property(nonatomic, getter=isScrollEnabled) BOOL scrollEnabled;
@property(nonatomic) CGSize contentSize;
@property(nonatomic) UIEdgeInsets adjustedContentInset;
@property(nonatomic) CGPoint contentOffset;
/** The recorder's script: the offsets setContentOffset:animated: keeps a new offset between. */
@property(nonatomic) CGFloat lowestReachableOffset;
@property(nonatomic) CGFloat highestReachableOffset;
- (void)setContentOffset:(CGPoint)offset animated:(BOOL)animated;
@end
