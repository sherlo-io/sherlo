#import "ConfigHelper.h"
#import "FileSystemHelper.h"

static NSString *const CONFIG_FILENAME = @"config.sherlo";
static NSString *const LOG_TAG = @"ConfigHelper";

/**
 * Helper for loading and managing Sherlo configuration.
 * Provides methods to read and parse configuration from the filesystem.
 */
@implementation ConfigHelper

/**
 * Loads and parses the Sherlo configuration file.
 * Attempts to decode the file content as base64 before parsing as JSON.
 * Returns an empty dictionary if the file doesn't exist or cannot be parsed.
 *
 * @param fileSystemHelper Helper class for file system operations
 * @return The parsed configuration as a NSDictionary
 */
+ (NSDictionary *)loadConfigWithFileSystemHelper:(FileSystemHelper *)fileSystemHelper {
    NSError *error = nil;
    NSString *configContent = [fileSystemHelper readFileAsString:CONFIG_FILENAME error:&error];
    
    if (error) {
        NSLog(@"[%@] Error reading config file: %@", LOG_TAG, error.localizedDescription);
        return nil;
    }
    
    if (!configContent || configContent.length == 0) {
        NSLog(@"[%@] Config file is empty", LOG_TAG);
        return nil;
    }
    
    // Try to decode if base64 encoded
    NSData *decodedData = nil;
    @try {
        decodedData = [[NSData alloc] initWithBase64EncodedString:configContent options:0];
        if (decodedData) {
            configContent = [[NSString alloc] initWithData:decodedData encoding:NSUTF8StringEncoding];
        }
    } @catch (NSException *exception) {
        NSLog(@"[%@] Config is not base64 encoded, trying to parse as plain JSON", LOG_TAG);
    }
    
    // Parse JSON
    NSError *jsonError = nil;
    NSData *jsonData = [configContent dataUsingEncoding:NSUTF8StringEncoding];
    NSDictionary *config = [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:&jsonError];
    
    if (jsonError) {
        NSLog(@"[%@] Invalid JSON in config file: %@", LOG_TAG, jsonError.localizedDescription);
        return nil;
    }
    
    return config;
}

/**
 * Determines the initial application mode based on the configuration.
 * Checks for an override mode in the config first, otherwise defaults to testing mode 
 * if config exists, or default mode if there's no valid config.
 * 
 * @param config The configuration object
 * @return The determined mode (default, storybook, or testing)
 */
+ (NSString *)determineModeFromConfig:(NSDictionary *)config {
    @try {
        if (config && config.count > 0) {
            NSString *overrideMode = config[@"overrideMode"];

            if (overrideMode) {
                NSLog(@"[%@] Running in %@ mode", LOG_TAG, overrideMode);
                return overrideMode;
            }
            
            return MODE_TESTING;
        }
    } @catch (NSException *exception) {
        NSLog(@"[%@] Failed to determine initial mode: %@", LOG_TAG, exception.reason);
    }
    
    return MODE_DEFAULT;
}

@end
