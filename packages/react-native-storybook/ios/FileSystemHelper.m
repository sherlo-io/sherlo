#import "FileSystemHelper.h"
#import "ErrorHelper.h"

@implementation FileSystemHelper

#pragma mark - Class Methods

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

#pragma mark - Instance Methods

- (instancetype)initWithErrorHelper:(ErrorHelper *)errorHelper
                   syncDirectoryPath:(NSString *)syncDirectoryPath {
    self = [super init];
    if (self) {
        _errorHelper = errorHelper;
        _syncDirectoryPath = [syncDirectoryPath copy];
    }
    return self;
}

- (void)mkdirWithPath:(NSString *)filepath
              resolver:(RCTPromiseResolveBlock)resolve
              rejecter:(RCTPromiseRejectBlock)reject {
    NSError *error = [FileSystemHelper mkdir:filepath];
    
    if (error) {
        reject(@"E_MKDIR", 
               [NSString stringWithFormat:@"Failed to create directory at path %@", filepath],
               error);
    } else {
        resolve(nil);
    }
}

- (void)appendFileWithPath:(NSString *)filepath
              base64Content:(NSString *)base64Content
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject {
    NSError *error = [FileSystemHelper appendFile:filepath contents:base64Content];
    
    if (error) {
        reject(@"E_APPENDFILE", 
               [NSString stringWithFormat:@"Failed to append to file at path %@", filepath],
               error);
    } else {
        resolve(nil);
    }
}

- (void)readFileWithPath:(NSString *)filepath
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject {
    @try {
        NSError *error = nil;
        NSString *base64Content = [FileSystemHelper readFile:filepath error:&error];
        
        if (error) {
            reject(@"E_READFILE", 
                  [NSString stringWithFormat:@"Failed to read file at path %@", filepath],
                  error);
        } else if (!base64Content) {
            reject(@"E_READFILE", 
                  @"File content is empty or could not be encoded to base64",
                  nil);
        } else {
            resolve(base64Content);
        }
    } @catch (NSException *exception) {
        [self.errorHelper handleError:@"ERROR_READ_FILE" 
                               error:exception.reason 
                    syncDirectoryPath:self.syncDirectoryPath];
        reject(@"E_READFILE", 
              exception.reason,
              nil);
    }
}

@end
