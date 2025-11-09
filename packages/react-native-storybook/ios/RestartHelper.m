#import "RestartHelper.h"
#import <React/RCTReloadCommand.h>

static NSString *const LOG_TAG = @"SherloModule:RestartHelper";
static NSString *const PREF_ACTIVE_STORY_ID = @"__SHERLO_ACTIVE_STORY_ID__";
static NSString *const PREF_ACTIVE_STORY_TIMESTAMP = @"__SHERLO_ACTIVE_STORY_TIMESTAMP__";
static const NSTimeInterval STORY_PERSISTENCE_TIMEOUT = 10.0; // seconds

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
+ (void)restart:(RCTBridge *)bridge {
    NSLog(@"[%@] Restarting", LOG_TAG);
    
    if ([NSThread isMainThread]) {
        RCTTriggerReloadCommandListeners(@"Sherlo: Reload");
    } else {
        dispatch_sync(dispatch_get_main_queue(), ^{
            RCTTriggerReloadCommandListeners(@"Sherlo: Reload");
        });
    }
}

/**
 * Restarts with a story ID, preserving the current mode.
 * This is used when switching stories within Storybook to trigger mock transformation.
 *
 * @param bridge The React Native bridge
 * @param storyId The story ID to persist, or nil to clear it
 */
+ (void)restartWithStoryId:(RCTBridge *)bridge storyId:(NSString *)storyId {
    NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
    
    if (storyId && [storyId length] > 0) {
        [defaults setObject:storyId forKey:PREF_ACTIVE_STORY_ID];
        [defaults setDouble:[[NSDate date] timeIntervalSince1970] forKey:PREF_ACTIVE_STORY_TIMESTAMP];
        [defaults synchronize];
        NSLog(@"[%@] Persisted active story ID for restart: %@", LOG_TAG, storyId);
    } else {
        [defaults removeObjectForKey:PREF_ACTIVE_STORY_ID];
        [defaults removeObjectForKey:PREF_ACTIVE_STORY_TIMESTAMP];
        [defaults synchronize];
        NSLog(@"[%@] Cleared persisted active story ID", LOG_TAG);
    }
    
    [self restart:bridge];
}

/**
 * Retrieves the persisted story ID if it's recent enough.
 * Clears the persisted state after reading (one-time use).
 *
 * @return The story ID if valid, or nil
 */
+ (NSString *)getPersistedStoryId {
    NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
    NSString *storyId = [defaults stringForKey:PREF_ACTIVE_STORY_ID];
    NSTimeInterval timestamp = [defaults doubleForKey:PREF_ACTIVE_STORY_TIMESTAMP];
    
    if (storyId && timestamp > 0) {
        NSTimeInterval timeDiff = [[NSDate date] timeIntervalSince1970] - timestamp;
        
        if (timeDiff <= STORY_PERSISTENCE_TIMEOUT) {
            [defaults removeObjectForKey:PREF_ACTIVE_STORY_ID];
            [defaults removeObjectForKey:PREF_ACTIVE_STORY_TIMESTAMP];
            [defaults synchronize];
            
            NSLog(@"[%@] Using persisted story ID from restart (age: %.2fs): %@", LOG_TAG, timeDiff, storyId);
            return storyId;
        } else {
            // Expired, clear it
            [defaults removeObjectForKey:PREF_ACTIVE_STORY_ID];
            [defaults removeObjectForKey:PREF_ACTIVE_STORY_TIMESTAMP];
            [defaults synchronize];
            
            NSLog(@"[%@] Persisted story ID expired (age: %.2fs)", LOG_TAG, timeDiff);
        }
    }
    
    return nil;
}

@end
