#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

@class FileSystemHelper;
@class RCTBridge;

/**
 * The shim's own state: the pre-main config read and the developer-path mode
 * switch. Everything that used to run after JS existed (screenshots, settle,
 * scroll, inspector data) has moved to the injected implementation - see
 * SherloModule.mm's dispatch table.
 */
@interface SherloModuleCore : NSObject

/**
 * Standard initialization method
 * @return An initialized instance
 */
- (instancetype)init;

/**
 * Returns constants exposed to the JavaScript side. Answered entirely from the
 * pre-main read: a late-attached implementation reads these frozen values off
 * the shim and never re-derives them.
 * @return Dictionary with mode, config, lastState and nativeVersion
 */
- (NSDictionary *)getSherloConstants;

/**
 * The developer path: set the mode and, when requested, reload the JS context.
 * Deliberately mechanical - no policy, because policy frozen at a customer's
 * build can never be corrected.
 *
 * @param mode One of 'default', 'storybook', 'testing'
 * @param reload Whether to trigger a JS reload after setting the mode
 */
- (void)setMode:(NSString *)mode reload:(BOOL)reload;

@end
