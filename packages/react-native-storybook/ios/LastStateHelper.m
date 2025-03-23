#import "LastStateHelper.h"
#import "FileSystemHelper.h"
#import "ErrorHelper.h"

static NSString *const LOG_TAG = @"LastStateHelper";
static NSString *const PROTOCOL_FILENAME = @"protocol.sherlo";

@interface LastStateHelper()

@property (nonatomic, strong) FileSystemHelper *fileSystemHelper;
@property (nonatomic, strong) ErrorHelper *errorHelper;
@property (nonatomic, strong) NSString *syncDirectoryPath;

@end

@implementation LastStateHelper

- (instancetype)initWithFileSystemHelper:(FileSystemHelper *)fileSystemHelper
                             errorHelper:(ErrorHelper *)errorHelper
                        syncDirectoryPath:(NSString *)syncDirectoryPath {
    self = [super init];
    if (self) {
        self.fileSystemHelper = fileSystemHelper;
        self.errorHelper = errorHelper;
        self.syncDirectoryPath = syncDirectoryPath;
    }
    return self;
}

/**
 * Reads the protocol file and extracts the last state information.
 * This includes the next snapshot index, filtered view IDs, and request ID.
 * 
 * @return NSDictionary containing the state information or nil if not found
 */
- (NSDictionary *)getLastState {
  @try {
    NSString *protocolPath = [self.syncDirectoryPath stringByAppendingPathComponent:PROTOCOL_FILENAME];
    NSLog(@"[%@] Reading protocol file at: %@", LOG_TAG, protocolPath);

    // Read file content using FileSystemHelper
    NSError *readError = nil;
    NSString *protocolContent = [FileSystemHelper readFileAsString:protocolPath error:&readError];

    if (readError || !protocolContent || [protocolContent stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]].length == 0) {
      NSLog(@"[%@] Protocol file is empty or doesn't exist", LOG_TAG);
      return [NSDictionary dictionary];
    }

    // Try to decode base64 if content is base64 encoded
    @try {
      NSData *decodedData = [[NSData alloc] initWithBase64EncodedString:protocolContent options:0];
      if (decodedData) {
        NSString *decodedString = [[NSString alloc] initWithData:decodedData encoding:NSUTF8StringEncoding];
        if (decodedString) {
          protocolContent = decodedString;
        }
      }
    } @catch (NSException *exception) {
      NSLog(@"[%@] Content is not base64 encoded, using raw content", LOG_TAG);
    }

    NSArray *responseLines = [protocolContent componentsSeparatedByString:@"\n"];
    NSDictionary *ackStart = nil;
    NSDictionary *lastRequestSnapshot = nil;
    NSDictionary *startItem = nil;  // Variable to store START action

    // Iterate through all lines in reverse order
    for (NSInteger i = responseLines.count - 1; i >= 0; i--) {
      @try {
        NSString *line = responseLines[i];
        if (!line || [line stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]].length == 0) {
          continue;
        }

        NSData *jsonData = [line dataUsingEncoding:NSUTF8StringEncoding];
        NSDictionary *responseItem = [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:&readError];

        if (readError) {
          NSLog(@"[%@] Error parsing protocol line: %@", LOG_TAG, readError.localizedDescription);
          continue;
        }

        NSString *action = responseItem[@"action"];
        if (!action) {
          continue;
        }

        if ([action isEqualToString:@"ACK_START"] && !ackStart) {
          ackStart = responseItem;
        } else if ([action isEqualToString:@"ACK_REQUEST_SNAPSHOT"] && !lastRequestSnapshot) {
          lastRequestSnapshot = responseItem;
        } else if ([action isEqualToString:@"START"] && !startItem) {
          startItem = responseItem;
        }

        // If we found all items, we can stop searching
        if (ackStart && lastRequestSnapshot && startItem) {
          break;
        }
      } @catch (NSException *exception) {
        // Ignore parse errors for invalid JSON lines
        NSLog(@"[%@] Error parsing protocol line: %@", LOG_TAG, exception.reason);
        continue;
      }
    }

    NSMutableDictionary *state = [NSMutableDictionary dictionary];
    if (ackStart) {
      NSNumber *nextSnapshotIndex;
      if (lastRequestSnapshot && lastRequestSnapshot[@"nextSnapshotIndex"]) {
        nextSnapshotIndex = lastRequestSnapshot[@"nextSnapshotIndex"];
      } else if (ackStart[@"nextSnapshotIndex"]) {
        nextSnapshotIndex = ackStart[@"nextSnapshotIndex"];
      } else {
        nextSnapshotIndex = @0;
      }

      [state setObject:nextSnapshotIndex forKey:@"nextSnapshotIndex"];

      NSDictionary *nextSnapshot;
      if (lastRequestSnapshot && lastRequestSnapshot[@"nextSnapshot"]) {
        nextSnapshot = lastRequestSnapshot[@"nextSnapshot"];
      } else if (ackStart[@"nextSnapshot"]) {
        nextSnapshot = ackStart[@"nextSnapshot"];
      } else {
        nextSnapshot = @{};
      }
      
      [state setObject:nextSnapshot forKey:@"nextSnapshot"];

      if (ackStart[@"filteredViewIds"]) {
        [state setObject:ackStart[@"filteredViewIds"] forKey:@"filteredViewIds"];
      } else {
        [state setObject:@[] forKey:@"filteredViewIds"];
      }

      NSString *requestId = @"";
      if (lastRequestSnapshot && lastRequestSnapshot[@"requestId"]) {
        requestId = lastRequestSnapshot[@"requestId"];
      } else if (ackStart[@"requestId"]) {
        requestId = ackStart[@"requestId"];
      }

      [state setObject:requestId forKey:@"requestId"];

      // Add snapshots from START action if available
      if (startItem && startItem[@"snapshots"]) {
        [state setObject:startItem[@"snapshots"] forKey:@"snapshots"];
      }
    }

    return state;
  } @catch (NSException *exception) {
    NSLog(@"[%@] Error getting last state: %@", LOG_TAG, exception.reason);
    if (self.errorHelper) {
      [self.errorHelper handleError:@"ERROR_LAST_STATE" error:exception syncDirectoryPath:self.syncDirectoryPath];
    }
    return [NSDictionary dictionary];
  }
}

@end 