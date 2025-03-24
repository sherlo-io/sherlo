#import "RestartHelper.h"
#import <React/RCTReloadCommand.h>

/**
 * Helper for restarting the React Native application.
 * Provides methods to reload the JavaScript bundle and recreate the React context.
 */
@implementation RestartHelper

/**
 * Reloads the React Native application by triggering the reload command.
 * Handles the reloading on the main thread to ensure UI safety.
 *
 * @param bridge The React Native bridge
 */
+ (void)reloadWithBridge:(RCTBridge *)bridge {
    if ([NSThread isMainThread]) {
        RCTTriggerReloadCommandListeners(@"Sherlo: Reload");
    } else {
        dispatch_sync(dispatch_get_main_queue(), ^{
            RCTTriggerReloadCommandListeners(@"Sherlo: Reload");
        });
    }
}

@end
