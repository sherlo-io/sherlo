#import "ConfigHelper.h"

static NSString *SHERLO_DIRECTORY_NAME = @"sherlo";
static NSString *CONFIG_FILENAME = @"config.sherlo";

@implementation ConfigHelper

+ (NSString *)getSyncDirectoryPath:(NSError **)error {
    NSArray *paths = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
    NSString *documentsPath = [paths firstObject];
    if (!documentsPath) {
        *error = [NSError errorWithDomain:@"ConfigHelper" code:1 userInfo:@{NSLocalizedDescriptionKey: @"Failed to get documents directory path"}];
        return nil;
    }

    NSString *syncDirectoryPath = [documentsPath stringByAppendingPathComponent:SHERLO_DIRECTORY_NAME];
    if (!syncDirectoryPath) {
        *error = [NSError errorWithDomain:@"ConfigHelper" code:2 userInfo:@{NSLocalizedDescriptionKey: @"Failed to get Sherlo directory path"}];
        return nil;
    }

    return syncDirectoryPath;
}

+ (NSDictionary *)loadConfig:(NSError **)error syncDirectoryPath:(NSString *)syncDirectoryPath {
    // This is the path to the config file created by the Sherlo Runner
    NSString *configPath = [syncDirectoryPath stringByAppendingPathComponent:CONFIG_FILENAME];
    if (!configPath) {
        *error = [NSError errorWithDomain:@"ConfigHelper" code:4 userInfo:@{NSLocalizedDescriptionKey: @"Failed to get config file path"}];
        return nil;
    }
    
    BOOL doesSherloConfigFileExist = [[NSFileManager defaultManager] fileExistsAtPath:configPath];
    if (doesSherloConfigFileExist) {
        NSString *configContent = [NSString stringWithContentsOfFile:configPath encoding:NSUTF8StringEncoding error:error];

        if (!*error) {
            NSData *jsonData = [configContent dataUsingEncoding:NSUTF8StringEncoding];
            NSDictionary *jsonDict = [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:error];

            if (!*error) {
                return jsonDict;
            }
        }
    }

    return nil;
}

@end
