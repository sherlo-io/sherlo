#import <Foundation/Foundation.h>

/**
 * A LOOP HELD STILL FOR THE PICTURE: every Core Animation animation in the app's windows that
 * loops forever (a Lottie, a native spinner) is put back on its own start and stopped there, so
 * the same screen gives the same picture every run, not wherever the loop happened to be.
 *
 * An animation that ends is left alone, so a screen with no loop settles as it always did. An
 * animation already held is left as it is. What is held stays held: the next story or scene draws
 * new views, with new animations.
 */
@interface SherloAnimationHold : NSObject

/** Hold every loop in every window of the app's connected scenes. Call on the main queue. YES when one was held. */
+ (BOOL)holdLoopsInAppWindows;

@end
