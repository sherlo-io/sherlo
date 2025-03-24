#import "LastStateHelper.h"
#import "FileSystemHelper.h"

/**
 * Helper for managing the last state of the Sherlo module.
 * Provides functionality to save, load, and retrieve the last state 
 * of the application, such as the active mode and other session-specific data.
 */
@implementation LastStateHelper

/**
 * Loads the last state from the filesystem.
 * Reads the state file, parses it as JSON, and returns the resulting object.
 *
 * @param fileSystemHelper The helper to use for file operations
 * @return A dictionary containing the last state, or nil if loading fails
 */
+ (NSDictionary *)loadStateWithFileSystemHelper:(FileSystemHelper *)fileSystemHelper {
    // Try to read last state file
    NSError *error = nil;
    NSString *lastStateFilePath = @"last-state.json";
    
    NSString *jsonString = [fileSystemHelper readFileAsString:lastStateFilePath error:&error];
    
    // Handle file reading error or empty file
    if (error || !jsonString || jsonString.length == 0) {
        if (error) {
            NSLog(@"[LastStateHelper] Error reading last state file: %@", error.localizedDescription);
        } else {
            NSLog(@"[LastStateHelper] No last state file found or file is empty");
        }
        return nil;
    }
    
    // Parse JSON content
    NSData *jsonData = [jsonString dataUsingEncoding:NSUTF8StringEncoding];
    id parsedState = [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:&error];
    
    // Handle JSON parsing errors
    if (error) {
        NSLog(@"[LastStateHelper] Error parsing last state JSON: %@", error.localizedDescription);
        return nil;
    }
    
    // Ensure we have a dictionary
    if (![parsedState isKindOfClass:[NSDictionary class]]) {
        NSLog(@"[LastStateHelper] Last state is not a dictionary: %@", parsedState);
        return nil;
    }
    
    return parsedState;
}

/**
 * Saves the provided state to the filesystem.
 * Serializes the state as JSON and writes it to the state file.
 *
 * @param state The state to save
 * @param fileSystemHelper The helper to use for file operations
 * @return YES if the state was saved successfully, NO otherwise
 */
+ (BOOL)saveState:(NSDictionary *)state withFileSystemHelper:(FileSystemHelper *)fileSystemHelper {
    // Validate input
    if (!state || ![state isKindOfClass:[NSDictionary class]]) {
        NSLog(@"[LastStateHelper] Invalid state provided for saving");
        return NO;
    }
    
    // Serialize to JSON
    NSError *error = nil;
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:state options:NSJSONWritingPrettyPrinted error:&error];
    
    if (error) {
        NSLog(@"[LastStateHelper] Error serializing state to JSON: %@", error.localizedDescription);
        return NO;
    }
    
    // Convert JSON data to string
    NSString *jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
    if (!jsonString) {
        NSLog(@"[LastStateHelper] Error converting JSON data to string");
        return NO;
    }
    
    // Write to file
    NSString *lastStateFilePath = @"last-state.json";
    BOOL success = [fileSystemHelper writeString:jsonString toFile:lastStateFilePath error:&error];
    
    if (!success) {
        NSLog(@"[LastStateHelper] Error writing last state to file: %@", error.localizedDescription);
        return NO;
    }
    
    NSLog(@"[LastStateHelper] Successfully saved state");
    return YES;
}

/**
 * Gets data from the last state using the specified key.
 * If the key is not found or the last state doesn't exist, returns nil.
 *
 * @param key The key to look for in the last state
 * @param fileSystemHelper The helper to use for file operations
 * @return The data associated with the key, or nil if not found
 */
+ (id)getDataForKey:(NSString *)key withFileSystemHelper:(FileSystemHelper *)fileSystemHelper {
    NSDictionary *lastState = [self loadStateWithFileSystemHelper:fileSystemHelper];
    
    if (!lastState) {
        return nil;
    }
    
    return [lastState objectForKey:key];
}

/**
 * Reads the protocol file and extracts the last state information.
 * This includes the next snapshot index, filtered view IDs, and request ID.
 * 
 * @param fileSystemHelper The file system helper for reading files
 * @return NSDictionary containing the state information or nil if not found
 */
+ (NSDictionary *)getLastStateWithFileSystemHelper:(FileSystemHelper *)fileSystemHelper {
  @try {
    NSError *readError = nil;
    NSString *protocolContent = [fileSystemHelper readFileAsString:PROTOCOL_FILENAME error:&readError];

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