#import "SherloIOSExceptionHandler.h"
#import "SherloModuleCore.h"
#import "FileSystemHelper.h"
#import "ProtocolHelper.h"
#import <objc/runtime.h>

#if !RCT_NEW_ARCH_ENABLED
#import <React/RCTExceptionsManager.h>
#endif

// Dedupe flag - set to YES after the first JS_ERROR is written to protocol.sherlo.
static BOOL sJsErrorWritten = NO;

#if !RCT_NEW_ARCH_ENABLED

static NSString *formatStack(NSArray *stack) {
    if (!stack || stack.count == 0) return @"";
    NSMutableArray *lines = [NSMutableArray array];
    for (NSDictionary *frame in stack) {
        NSString *line = [NSString stringWithFormat:@"  at %@ (%@:%@:%@)",
            frame[@"methodName"] ?: @"<unknown>",
            frame[@"file"] ?: @"<unknown>",
            frame[@"lineNumber"] ?: @"0",
            frame[@"column"] ?: @"0"];
        [lines addObject:line];
    }
    return [lines componentsJoinedByString:@"\n"];
}

#endif

@implementation SherloIOSExceptionHandler

// Installs the swizzles once via dispatch_once.
// On new arch the body is a no-op; on old arch two methods are swizzled.
+ (void)install {
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
#if !RCT_NEW_ARCH_ENABLED
        [self swizzleRCTExceptionsManager];
        [self swizzleRCTCxxBridge];
#endif
    });
}

#if !RCT_NEW_ARCH_ENABLED

// Swizzles RCTExceptionsManager.reportFatalException:stack:exceptionId: to write
// a JS_ERROR protocol entry when a fatal JS exception is thrown.
// Only writes if in testing mode and no error has been written yet.
+ (void)swizzleRCTExceptionsManager {
    Class cls = [RCTExceptionsManager class];
    SEL sel = @selector(reportFatalException:stack:exceptionId:);
    Method method = class_getInstanceMethod(cls, sel);
    if (!method) return;

    FileSystemHelper *fs = [[FileSystemHelper alloc] init];
    IMP originalIMP = method_getImplementation(method);

    IMP newIMP = imp_implementationWithBlock(^(id selfObj, NSString *message, NSArray *stack, double exceptionId) {
        if (!sJsErrorWritten && [[SherloModuleCore currentMode] isEqualToString:@"testing"]) {
            sJsErrorWritten = YES;
            NSString *stackStr = formatStack(stack);
            [ProtocolHelper writeEarlyJsError:fs
                                         name:@"Error"
                                      message:message ?: @"Fatal JS exception"
                                        stack:stackStr];
        }
        typedef void (*Fn)(id, SEL, NSString *, NSArray *, double);
        ((Fn)originalIMP)(selfObj, sel, message, stack, exceptionId);
    });

    method_setImplementation(method, newIMP);
}

// Swizzles RCTCxxBridge.handleError: to write a JS_ERROR entry for bridge-level
// errors (e.g. bundle load failures). Only writes if in testing mode and no error
// has been written yet.
+ (void)swizzleRCTCxxBridge {
    Class cls = NSClassFromString(@"RCTCxxBridge");
    if (!cls) return;
    SEL sel = NSSelectorFromString(@"handleError:");
    Method method = class_getInstanceMethod(cls, sel);
    if (!method) return;

    FileSystemHelper *fs = [[FileSystemHelper alloc] init];
    IMP originalIMP = method_getImplementation(method);

    IMP newIMP = imp_implementationWithBlock(^(id selfObj, NSError *error) {
        if (!sJsErrorWritten && [[SherloModuleCore currentMode] isEqualToString:@"testing"]) {
            sJsErrorWritten = YES;
            NSString *msg = error.localizedDescription ?: @"RCTCxxBridge error";
            [ProtocolHelper writeEarlyJsError:fs name:@"Error" message:msg stack:@""];
        }
        typedef void (*Fn)(id, SEL, NSError *);
        ((Fn)originalIMP)(selfObj, sel, error);
    });

    method_setImplementation(method, newIMP);
}

#endif

@end
