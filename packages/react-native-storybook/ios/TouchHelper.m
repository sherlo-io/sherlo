#import "TouchHelper.h"
#import "InspectorHelper.h"
#import <dlfcn.h>
#import <mach/mach_time.h>

// The KIF and EarlGrey method: a UITouch carrying an IOHIDEvent is put in the application's touches
// event and sent through -[UIApplication sendEvent:], so UIKit hands it to every recognizer on the
// hit view's way to the window, as it does a finger's.
//
// Every call below is private. The methods are only declared here and the IOKit functions are
// found with dlsym, so the binary imports none of them; each is probed before the first touch.

typedef struct __IOHIDEvent *IOHIDEventRef;
typedef double IOHIDFloat;

@interface UITouch (SherloTouch)
- (void)setWindow:(UIWindow *)window;
- (void)setView:(UIView *)view;
- (void)setTapCount:(NSUInteger)tapCount;
- (void)setIsTap:(BOOL)isTap;
- (void)setTimestamp:(NSTimeInterval)timestamp;
- (void)setPhase:(UITouchPhase)phase;
- (void)setGestureView:(UIView *)view;
- (void)_setLocationInWindow:(CGPoint)location resetPrevious:(BOOL)resetPrevious;
- (void)_setIsFirstTouchForView:(BOOL)first;
- (void)_setIsTapToClick:(BOOL)tapToClick;
- (void)_setHidEvent:(IOHIDEventRef)event;
@end

@interface UIApplication (SherloTouch)
- (UIEvent *)_touchesEvent;
@end

@interface UIEvent (SherloTouch)
- (void)_addTouch:(UITouch *)touch forDelayedDelivery:(BOOL)delayed;
- (void)_clearTouches;
- (void)_setHIDEvent:(IOHIDEventRef)event;
@end

typedef IOHIDEventRef (*CreateDigitizerEventFn)(CFAllocatorRef, uint64_t, uint32_t, uint32_t,
                                                uint32_t, uint32_t, uint32_t, IOHIDFloat,
                                                IOHIDFloat, IOHIDFloat, IOHIDFloat, IOHIDFloat,
                                                Boolean, Boolean, uint32_t);
typedef IOHIDEventRef (*CreateFingerEventFn)(CFAllocatorRef, uint64_t, uint32_t, uint32_t, uint32_t,
                                             IOHIDFloat, IOHIDFloat, IOHIDFloat, IOHIDFloat,
                                             IOHIDFloat, IOHIDFloat, IOHIDFloat, IOHIDFloat,
                                             IOHIDFloat, IOHIDFloat, Boolean, Boolean, uint32_t);
typedef void (*SetIntegerFn)(IOHIDEventRef, uint32_t, int32_t, uint32_t);
typedef void (*SetSenderFn)(IOHIDEventRef, uint64_t);
typedef void (*AppendFn)(IOHIDEventRef, IOHIDEventRef, uint32_t);

static const uint32_t kTransducerHand = 3;
static const uint32_t kEventRange = 1 << 0;
static const uint32_t kEventTouch = 1 << 1;
static const uint32_t kEventPosition = 1 << 2;
static const uint32_t kFieldDisplayIntegrated = (11 << 16) | 25;
static const uint32_t kFieldBuiltIn = 4;

static CreateDigitizerEventFn createHand;
static CreateFingerEventFn createFinger;
static SetIntegerFn setInteger;
static SetSenderFn setSender;
static AppendFn append;

/** The IOKit functions the touch's HID event is made with, found once. */
static void FindIOKit(void) {
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        void *iokit = dlopen("/System/Library/Frameworks/IOKit.framework/IOKit", RTLD_NOW);
        if (!iokit) return;
        createHand = (CreateDigitizerEventFn)dlsym(iokit, "IOHIDEventCreateDigitizerEvent");
        createFinger = (CreateFingerEventFn)dlsym(iokit, "IOHIDEventCreateDigitizerFingerEventWithQuality");
        setInteger = (SetIntegerFn)dlsym(iokit, "IOHIDEventSetIntegerValueWithOptions");
        setSender = (SetSenderFn)dlsym(iokit, "IOHIDEventSetSenderID");
        append = (AppendFn)dlsym(iokit, "IOHIDEventAppendEvent");
    });
}

/** The private calls the touch needs that this iOS lacks, by name; empty when it has them all. */
static NSArray<NSString *> *MissingCalls(void) {
    NSMutableArray<NSString *> *missing = [NSMutableArray array];
    UITouch *probe = [[UITouch alloc] init];
    for (NSString *name in @[ @"setWindow:", @"setView:", @"setTapCount:", @"setTimestamp:",
                              @"setPhase:", @"_setLocationInWindow:resetPrevious:",
                              @"_setHidEvent:" ]) {
        if (![probe respondsToSelector:NSSelectorFromString(name)]) {
            [missing addObject:[@"UITouch." stringByAppendingString:name]];
        }
    }
    UIApplication *application = UIApplication.sharedApplication;
    UIEvent *touchesEvent = nil;
    if ([application respondsToSelector:@selector(_touchesEvent)]) {
        touchesEvent = [application _touchesEvent];
    } else {
        [missing addObject:@"UIApplication._touchesEvent"];
    }
    for (NSString *name in @[ @"_clearTouches", @"_setHIDEvent:", @"_addTouch:forDelayedDelivery:" ]) {
        if (![touchesEvent respondsToSelector:NSSelectorFromString(name)]) {
            [missing addObject:[@"UIEvent." stringByAppendingString:name]];
        }
    }
    FindIOKit();
    if (!createHand) [missing addObject:@"IOHIDEventCreateDigitizerEvent"];
    if (!createFinger) [missing addObject:@"IOHIDEventCreateDigitizerFingerEventWithQuality"];
    if (!setInteger) [missing addObject:@"IOHIDEventSetIntegerValueWithOptions"];
    if (!setSender) [missing addObject:@"IOHIDEventSetSenderID"];
    if (!append) [missing addObject:@"IOHIDEventAppendEvent"];
    return missing;
}

/**
 * The digitizer event a real finger at `location` carries, touching or lifted. A finger going down
 * or lifting changes its range and touch; one moving changes its position alone. The caller
 * releases it.
 */
static IOHIDEventRef HIDEventFor(CGPoint location, BOOL touching, BOOL moving) {
    uint64_t now = mach_absolute_time();
    IOHIDEventRef hand = createHand(kCFAllocatorDefault, now, kTransducerHand, 0, 0, kEventTouch, 0,
                                    0, 0, 0, 0, 0, touching, touching, 0);
    setInteger(hand, kFieldDisplayIntegrated, 1, -268435456);
    setInteger(hand, kFieldBuiltIn, 1, -268435456);
    setSender(hand, 0x0000000123456789);
    uint32_t changed = moving ? kEventPosition : kEventRange | kEventTouch;
    IOHIDEventRef finger = createFinger(kCFAllocatorDefault, now, 1, 2, changed,
                                        location.x, location.y, 0, 0, 0, 5.0, 5.0, 1.0, 1.0, 1.0,
                                        touching, touching, 0);
    setInteger(finger, kFieldDisplayIntegrated, 1, -268435456);
    append(hand, finger, 0);
    CFRelease(finger);
    return hand;
}

/** Send `touch`, in its phase now, as the application's one touch. */
static void SendTouch(UITouch *touch, CGPoint location, BOOL touching) {
    IOHIDEventRef hid = HIDEventFor(location, touching, touch.phase == UITouchPhaseMoved);
    [touch setTimestamp:NSProcessInfo.processInfo.systemUptime];
    [touch _setHidEvent:hid];
    UIEvent *event = [UIApplication.sharedApplication _touchesEvent];
    [event _clearTouches];
    [event _setHIDEvent:hid];
    [event _addTouch:touch forDelayedDelivery:NO];
    [UIApplication.sharedApplication sendEvent:event];
    CFRelease(hid);
}

/** The React tag of `view` or of the nearest view above it that has one, as InspectorHelper reads ids; -1 for none. */
static long long ReactTagAt(UIView *view) {
    for (UIView *node = view; node; node = node.superview) {
        long long viewId = [InspectorHelper idOf:node];
        if (viewId >= 0) return viewId;
    }
    return -1;
}

/** Whether a recognizer of React Native (RCT...) or of gesture-handler (RN...) took the touch. */
static BOOL ReachedReact(UITouch *touch) {
    for (UIGestureRecognizer *recognizer in touch.gestureRecognizers) {
        NSString *name = NSStringFromClass(recognizer.class);
        if ([name hasPrefix:@"RCT"] || [name hasPrefix:@"RN"]) return YES;
    }
    return NO;
}

/**
 * The view a finger at `point` goes down on, or nil once `resolve` was answered with why nothing is
 * touched: this iOS lacks a private call the touch needs, or the window takes no touch there.
 */
static UIView *TouchableHit(UIWindow *window, CGPoint point, RCTPromiseResolveBlock resolve) {
    NSArray<NSString *> *missing = MissingCalls();
    if (missing.count > 0) {
        NSLog(@"[SherloModule:TouchHelper] This iOS lacks %@", [missing componentsJoinedByString:@", "]);
        resolve(@{ @"reachedReact" : @NO, @"hitTag" : @(-1), @"hitClass" : @"", @"missing" : missing });
        return nil;
    }
    UIView *hit = [window hitTest:point withEvent:nil];
    if (!hit) {
        // A window that takes no touch: what a finger there would press is the window itself.
        resolve(@{ @"reachedReact" : @NO, @"hitTag" : @(-1),
                   @"hitClass" : NSStringFromClass(window.class), @"missing" : @[] });
    }
    return hit;
}

/** A finger put down on `hit` at `point`, sent in its Began phase. */
static UITouch *TouchDown(UIWindow *window, UIView *hit, CGPoint point) {
    UITouch *touch = [[UITouch alloc] init];
    [touch setWindow:window];
    [touch setTapCount:1];
    [touch _setLocationInWindow:point resetPrevious:YES];
    [touch setView:hit];
    [touch setPhase:UITouchPhaseBegan];
    // Calls a finger's touch also carries, gone from some iOS (iOS 26 has neither of the last two).
    if ([touch respondsToSelector:@selector(_setIsFirstTouchForView:)]) [touch _setIsFirstTouchForView:YES];
    if ([touch respondsToSelector:@selector(_setIsTapToClick:)]) [touch _setIsTapToClick:NO];
    if ([touch respondsToSelector:@selector(setIsTap:)]) [touch setIsTap:YES];
    if ([touch respondsToSelector:@selector(setGestureView:)]) [touch setGestureView:hit];
    SendTouch(touch, point, YES);
    return touch;
}

/** What a touch that went down on `hit` answers once it ended. */
static NSDictionary *Reached(BOOL reachedReact, UIView *hit) {
    return @{ @"reachedReact" : @(reachedReact), @"hitTag" : @(ReactTagAt(hit)),
              @"hitClass" : NSStringFromClass(hit.class), @"missing" : @[] };
}

/** How many moves a second a swipe's finger reports, as a screen's digitizer does at 60 Hz. */
static const double kMovesPerSecond = 60;

@implementation TouchHelper

+ (void)tapInWindow:(UIWindow *)window
                 at:(CGPoint)point
             holdMs:(double)holdMs
            resolve:(RCTPromiseResolveBlock)resolve {
    UIView *hit = TouchableHit(window, point, resolve);
    if (!hit) return;
    UITouch *touch = TouchDown(window, hit, point);
    BOOL reachedReact = ReachedReact(touch);

    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(holdMs * NSEC_PER_MSEC)),
                   dispatch_get_main_queue(), ^{
        [touch setPhase:UITouchPhaseEnded];
        SendTouch(touch, point, NO);
        resolve(Reached(reachedReact, hit));
    });
}

+ (void)swipeInWindow:(UIWindow *)window
                 from:(CGPoint)from
                   to:(CGPoint)to
           durationMs:(double)durationMs
              resolve:(RCTPromiseResolveBlock)resolve {
    UIView *hit = TouchableHit(window, from, resolve);
    if (!hit) return;
    UITouch *touch = TouchDown(window, hit, from);
    BOOL reachedReact = ReachedReact(touch);
    NSInteger moves = MAX(1, (NSInteger)lround(durationMs / 1000.0 * kMovesPerSecond));
    int64_t moveNs = (int64_t)(durationMs / moves * NSEC_PER_MSEC);

    // Each move is sent a frame after the one before it has been handled, so a busy main thread
    // slows the finger and never bunches its moves into one instant.
    __block void (^moveTo)(NSInteger) = nil;
    moveTo = ^(NSInteger step) {
        CGFloat part = (CGFloat)step / moves;
        CGPoint at = CGPointMake(from.x + (to.x - from.x) * part, from.y + (to.y - from.y) * part);
        [touch _setLocationInWindow:at resetPrevious:NO];
        [touch setPhase:UITouchPhaseMoved];
        if ([touch respondsToSelector:@selector(setIsTap:)]) [touch setIsTap:NO];
        SendTouch(touch, at, YES);
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, moveNs), dispatch_get_main_queue(), ^{
            if (step < moves) {
                moveTo(step + 1);
                return;
            }
            moveTo = nil;
            [touch setPhase:UITouchPhaseEnded];
            SendTouch(touch, to, NO);
            resolve(Reached(reachedReact, hit));
        });
    };
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, moveNs), dispatch_get_main_queue(), ^{
        moveTo(1);
    });
}

@end
