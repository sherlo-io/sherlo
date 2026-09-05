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
 * Returns constants derived entirely from the pre-main read: mode/config as
 * this device's OWN files on disk determine them, with nothing injected. This
 * is the shim's fallback answer - see SherloModule.mm's getSherloConstants,
 * which prefers a registered implementation's own synchronous answer first.
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
