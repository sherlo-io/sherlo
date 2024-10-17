#import "FileSystemHelper.h"

@implementation FileSystemHelper

+ (void)mkdir:(NSString *)filepath error:(NSError **)error {
    [[NSFileManager defaultManager] createDirectoryAtPath:filepath withIntermediateDirectories:YES attributes:nil error:error];
}

+ (void)appendFile:(NSString *)filepath contents:(NSString *)base64Content error:(NSError **)error {
    NSData *data = [[NSData alloc] initWithBase64EncodedString:base64Content options:0];
    if (!data) {
        if (error) {
            *error = [NSError errorWithDomain:@"FileSystemHelper" code:1 userInfo:@{NSLocalizedDescriptionKey: @"Invalid base64 content"}];
        }
        return;
    }

    if (![[NSFileManager defaultManager] fileExistsAtPath:filepath]) {
        BOOL success = [[NSFileManager defaultManager] createFileAtPath:filepath contents:data attributes:nil];
        if (!success) {
            if (error) {
                *error = [NSError errorWithDomain:NSCocoaErrorDomain code:NSFileWriteUnknownError userInfo:nil];
            }
            return;
        }
    } else {
        NSFileHandle *fileHandle = [NSFileHandle fileHandleForUpdatingAtPath:filepath];
        if (!fileHandle) {
            if (error) {
                *error = [NSError errorWithDomain:@"FileSystemHelper" code:2 userInfo:@{NSLocalizedDescriptionKey: @"Failed to get file handle"}];
            }
            return;
        }
        [fileHandle seekToEndOfFile];
        [fileHandle writeData:data];
        [fileHandle closeFile];
    }
}

+ (NSString *)readFile:(NSString *)filepath error:(NSError **)error {
    NSData *content = [NSData dataWithContentsOfFile:filepath options:0 error:error];
    if (!content) {
        return nil;
    }
    return [content base64EncodedStringWithOptions:0];
}

@end
