#import "SherloAnimationHold.h"

#import <QuartzCore/QuartzCore.h>
#import <UIKit/UIKit.h>

/** An animation that runs longer than this is a loop for a picture: no capture waits an hour. */
static const CFTimeInterval LOOP_LONGER_THAN_SECONDS = 60 * 60;

/**
 * Whether `animation` runs for longer than any capture waits: repeated forever, as a spinner, a
 * Lottie set to loop or a UIView animation with the repeat option is (repeatCount HUGE_VALF or the
 * largest float, or a repeatDuration as long).
 */
static BOOL SherloLoopsForever(CAAnimation *animation) {
  CFTimeInterval duration = animation.duration > 0 ? animation.duration : 0.25;
  CFTimeInterval active = animation.repeatDuration > 0 ? animation.repeatDuration
                          : animation.repeatCount > 0 ? duration * animation.repeatCount
                                                      : duration;
  return isnan(active) || active > LOOP_LONGER_THAN_SECONDS;
}

/** Hold every loop on `layer` and on every layer under it. YES when one was held. */
static BOOL SherloHoldLoopsUnder(CALayer *layer) {
  BOOL anyHeld = NO;
  for (NSString *key in layer.animationKeys ?: @[]) {
    CAAnimation *animation = [layer animationForKey:key];
    if (!SherloLoopsForever(animation) || animation.speed == 0) continue;
    CAAnimation *held = [animation copy];
    // Begun now (a beginTime of 0 is now, once added) and stopped (speed 0) on its own start: its
    // timeOffset, 0 unless the app set one. Its local time no longer moves with the clock, so the
    // frame is the loop's first, every run.
    held.beginTime = 0;
    held.speed = 0;
    held.timeOffset = animation.timeOffset;
    [layer addAnimation:held forKey:key];
    anyHeld = YES;
  }
  for (CALayer *sublayer in [layer.sublayers copy] ?: @[]) {
    anyHeld = SherloHoldLoopsUnder(sublayer) || anyHeld;
  }
  if (layer.mask) anyHeld = SherloHoldLoopsUnder(layer.mask) || anyHeld;
  return anyHeld;
}

@implementation SherloAnimationHold

+ (BOOL)holdLoopsInAppWindows {
  BOOL anyHeld = NO;
  [CATransaction begin];
  [CATransaction setDisableActions:YES];
  for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
    if (![scene isKindOfClass:[UIWindowScene class]]) continue;
    for (UIWindow *window in ((UIWindowScene *)scene).windows) {
      anyHeld = SherloHoldLoopsUnder(window.layer) || anyHeld;
    }
  }
  [CATransaction commit];
  return anyHeld;
}

@end
