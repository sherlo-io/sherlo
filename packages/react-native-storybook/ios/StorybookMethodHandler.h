#import <Foundation/Foundation.h>
#import <React/RCTBridge.h>
#import <React/RCTBridgeModule.h>
#import "ErrorHelper.h"
#import "ModeHelper.h"

/**
 * Handler for Storybook-related methods.
 * Encapsulates logic for toggling, opening, and closing Storybook.
 */
@interface StorybookMethodHandler : NSObject

/**
 * The React Native bridge.
 */
@property (nonatomic, weak) RCTBridge *bridge;

/**
 * The error helper for error handling.
 */
@property (nonatomic, strong) ErrorHelper *errorHelper;

/**
 * The sync directory path.
 */
@property (nonatomic, copy) NSString *syncDirectoryPath;

/**
 * Initializes a new StorybookMethodHandler.
 *
 * @param bridge The React Native bridge
 * @param errorHelper The error helper
 * @param syncDirectoryPath The sync directory path
 * @return An initialized handler
 */
- (instancetype)initWithBridge:(RCTBridge *)bridge
                   errorHelper:(ErrorHelper *)errorHelper
              syncDirectoryPath:(NSString *)syncDirectoryPath;

/**
 * Verifies integration with Sherlo.
 *
 * @param resolve The promise resolve block
 * @param reject The promise reject block
 */
- (void)verifyIntegrationWithResolver:(RCTPromiseResolveBlock)resolve
                             rejecter:(RCTPromiseRejectBlock)reject;

/**
 * Toggles between Storybook and default mode.
 *
 * @param resolve The promise resolve block
 * @param reject The promise reject block
 */
- (void)toggleStorybookWithResolver:(RCTPromiseResolveBlock)resolve
                           rejecter:(RCTPromiseRejectBlock)reject;

/**
 * Opens Storybook mode.
 *
 * @param resolve The promise resolve block
 * @param reject The promise reject block
 */
- (void)openStorybookWithResolver:(RCTPromiseResolveBlock)resolve
                         rejecter:(RCTPromiseRejectBlock)reject;

/**
 * Closes Storybook and returns to default mode.
 *
 * @param resolve The promise resolve block
 * @param reject The promise reject block
 */
- (void)closeStorybookWithResolver:(RCTPromiseResolveBlock)resolve
                          rejecter:(RCTPromiseRejectBlock)reject;

@end 