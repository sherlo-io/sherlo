#import "FileSystemHelper.h"

@implementation FileSystemHelper

+ (NSError *)mkdir:(NSString *)path {
    NSError *error = nil;
    [[NSFileManager defaultManager] createDirectoryAtPath:path
                              withIntermediateDirectories:YES
                                               attributes:nil
                                                    error:&error];
    return error;
}

+ (NSError *)appendFile:(NSString *)filepath contents:(NSString *)base64Content {
    NSData *data = [[NSData alloc] initWithBase64EncodedString:base64Content options:0];
    if (!data) {
        return [NSError errorWithDomain:@"FileSystemHelper" code:1 userInfo:@{NSLocalizedDescriptionKey: @"Invalid base64 content"}];
    }

    if (![[NSFileManager defaultManager] fileExistsAtPath:filepath]) {
        BOOL success = [[NSFileManager defaultManager] createFileAtPath:filepath contents:data attributes:nil];
        if (!success) {
            return [NSError errorWithDomain:NSCocoaErrorDomain code:NSFileWriteUnknownError userInfo:nil];
        }
    } else {
        NSFileHandle *fileHandle = [NSFileHandle fileHandleForUpdatingAtPath:filepath];
        if (!fileHandle) {
            return [NSError errorWithDomain:@"FileSystemHelper" code:2 userInfo:@{NSLocalizedDescriptionKey: @"Failed to get file handle"}];
        }
        [fileHandle seekToEndOfFile];
        [fileHandle writeData:data];
        [fileHandle closeFile];
    }
    
    return nil;
}

+ (NSString *)readFile:(NSString *)filepath error:(NSError **)error {
    NSData *content = [NSData dataWithContentsOfFile:filepath options:0 error:error];
    if (!content) {
        return nil;
    }
    return [content base64EncodedStringWithOptions:0];
}

@end
