#import "LastStateHelper.h"
#import "FileSystemHelper.h"

static NSString *const LOG_TAG = @"SherloModule:LastStateHelper";
static NSString *const PROTOCOL_FILENAME = @"protocol.sherlo";

/**
 * Helper for managing the last state of the Sherlo module.
 * Provides functionality to save, load, and retrieve the last state 
 * of the application, such as the active mode and other session-specific data.
 */
@implementation LastStateHelper

/**
 * Reads the protocol file and extracts the last state information.
 * This includes the next snapshot index, filtered view IDs, and request ID.
 * 
 * @param fileSystemHelper The file system helper for reading files
 * @return NSDictionary containing the state information or nil if not found
 */
+ (NSDictionary *)getLastState:(FileSystemHelper *)fileSystemHelper {
  @try {
    NSError *readError = nil;
    NSString *protocolContent = [fileSystemHelper readFile:PROTOCOL_FILENAME error:&readError];

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
      NSDictionary *nextSnapshot;
      if (lastRequestSnapshot && lastRequestSnapshot[@"nextSnapshot"]) {
        nextSnapshot = lastRequestSnapshot[@"nextSnapshot"];
      } else if (ackStart[@"nextSnapshot"]) {
        nextSnapshot = ackStart[@"nextSnapshot"];
      } else {
        nextSnapshot = @{};
      }
      
      [state setObject:nextSnapshot forKey:@"nextSnapshot"];

      NSString *requestId = @"";
      if (lastRequestSnapshot && lastRequestSnapshot[@"requestId"]) {
        requestId = lastRequestSnapshot[@"requestId"];
      } else if (ackStart[@"requestId"]) {
        requestId = ackStart[@"requestId"];
      }

      [state setObject:requestId forKey:@"requestId"];
    }

    return state;
  } @catch (NSException *exception) {
    NSLog(@"[%@] Error getting last state: %@", LOG_TAG, exception.reason);
    return [NSDictionary dictionary];
  }
}

@end 