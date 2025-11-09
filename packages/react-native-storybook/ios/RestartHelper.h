#import <Foundation/Foundation.h>
#import <React/RCTBridge.h>

@interface RestartHelper : NSObject

+ (void)restart:(RCTBridge *)bridge;
+ (void)restartWithStoryId:(RCTBridge *)bridge storyId:(NSString *)storyId;
+ (NSString *)getPersistedStoryId;

@end
