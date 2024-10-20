#import "RestartHelper.h"
#import <React/RCTReloadCommand.h>

@implementation RestartHelper

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
