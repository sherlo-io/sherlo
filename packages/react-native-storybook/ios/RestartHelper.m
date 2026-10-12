#import "RestartHelper.h"
#import <React/RCTReloadCommand.h>

static NSString *const LOG_TAG = @"SherloModule:RestartHelper";

/**
 * Restarts the app's JavaScript in the same process.
 *
 * Every restart Sherlo makes on iOS is this reload: a move between modes, a capture moving the app
 * into testing mode, and each story a run names. The process lives on, so what native code holds
 * in memory - the mode, the address handed at launch beside it, the connection, the run's settings
 * and the story to show - is all there when the JavaScript starts again. Nothing is written down.
 */
@implementation RestartHelper

/**
 * Asks React Native to reload the JavaScript, on the main thread. It never waits for the reload: a
 * caller on the connection's queue must not stand still while the main thread waits on that queue.
 *
 * @param bridge The React Native bridge (unused: the reload command reaches every host)
 */
+ (void)restart:(RCTBridge *)bridge {
    NSLog(@"[%@] Reloading the JavaScript", LOG_TAG);

    dispatch_async(dispatch_get_main_queue(), ^{
        RCTTriggerReloadCommandListeners(@"Sherlo: Reload");
    });
}

@end
