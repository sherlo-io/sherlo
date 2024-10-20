#import "InspectorHelper.h"
#import <UIKit/UIKit.h>

@implementation InspectorHelper

+ (NSString *)dumpBoundaries:(NSError **)error {
    UIWindow *keyWindow = [UIApplication sharedApplication].keyWindow;
    if (!keyWindow) {
      *error = [NSError errorWithDomain:@"InspectorHelper" code:1 userInfo:@{NSLocalizedDescriptionKey: @"Could not find the key window"}];
      return nil;
    }

    UIView *rootView = keyWindow.rootViewController.view;
    if (!rootView) {
      *error = [NSError errorWithDomain:@"InspectorHelper" code:2 userInfo:@{NSLocalizedDescriptionKey: @"Could not find the root view"}];
      return nil;
    }

    NSMutableArray *viewList = [NSMutableArray array];
    [self collectViewInfo:rootView intoArray:viewList];

    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:viewList options:0 error:error];
    if (!jsonData) {
        *error = [NSError errorWithDomain:@"InspectorHelper" code:3 userInfo:@{NSLocalizedDescriptionKey: @"Could not serialize view data to JSON"}];
        return nil;
    }

    return [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
}

+ (void)collectViewInfo:(UIView *)view intoArray:(NSMutableArray *)array {
    NSMutableDictionary *viewDict = [NSMutableDictionary dictionary];

    NSString *className = NSStringFromClass([view class]);
    [viewDict setObject:className forKey:@"className"];

    BOOL isVisible = !view.hidden && view.alpha > 0.01 && view.window != nil;
    [viewDict setObject:@(isVisible) forKey:@"isVisible"];

    if (isVisible) {
        CGRect windowFrame = [view convertRect:view.bounds toView:nil];
        [viewDict setObject:@(windowFrame.origin.x) forKey:@"x"];
        [viewDict setObject:@(windowFrame.origin.y) forKey:@"y"];
        [viewDict setObject:@(windowFrame.size.width) forKey:@"width"];
        [viewDict setObject:@(windowFrame.size.height) forKey:@"height"];

        if (view.accessibilityIdentifier) {
            [viewDict setObject:view.accessibilityIdentifier forKey:@"accessibilityIdentifier"];
        }

        if (view.backgroundColor) {
            CGFloat red, green, blue, alpha;
            [view.backgroundColor getRed:&red green:&green blue:&blue alpha:&alpha];
            NSString *hexColor = [NSString stringWithFormat:@"#%02lX%02lX%02lX",
                                   lroundf(red * 255),
                                   lroundf(green * 255),
                                   lroundf(blue * 255)];
            [viewDict setObject:hexColor forKey:@"backgroundColor"];
        }

        if ([view isKindOfClass:[UILabel class]]) {
            UILabel *label = (UILabel *)view;
            if (label.text) {
                [viewDict setObject:label.text forKey:@"text"];
            }
            [viewDict setObject:@(label.font.pointSize) forKey:@"fontSize"];
        }
        else if ([view isKindOfClass:[UIButton class]]) {
            UIButton *button = (UIButton *)view;
            NSString *buttonText = [button titleForState:UIControlStateNormal];
            if (buttonText) {
                [viewDict setObject:buttonText forKey:@"text"];
            }
            [viewDict setObject:@(button.titleLabel.font.pointSize) forKey:@"fontSize"];
        }
        else if ([view isKindOfClass:[UITextField class]]) {
            UITextField *textField = (UITextField *)view;
            if (textField.text) {
                [viewDict setObject:textField.text forKey:@"text"];
            }
            [viewDict setObject:@(textField.font.pointSize) forKey:@"fontSize"];
        }
    }

    [array addObject:viewDict];

    for (UIView *subview in view.subviews) {
        [self collectViewInfo:subview intoArray:array];
    }
}

@end
