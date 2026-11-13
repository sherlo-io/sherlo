#import <Foundation/Foundation.h>

@interface KeyboardHelper : NSObject

+ (void)setupKeyboardSwizzling;
/** Whether the swizzling ran, so no text field can take focus (told to JS as fieldsTakeFocus). */
+ (BOOL)focusLocked;

@end 