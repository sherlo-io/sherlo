#import "SherloIOSExceptionHandler.h"
#import "SherloModuleCore.h"
#import "FileSystemHelper.h"
#import "ProtocolHelper.h"
#import <objc/runtime.h>

#if !RCT_NEW_ARCH_ENABLED
#import <React/RCTExceptionsManager.h>
// JSI headers are available transitively via React-Core → React-cxxreact → React-jsi.
#include <jsi/jsi.h>

/**
 * Minimal forward declaration of RCTCxxBridge to expose the -runtime accessor.
 *
 * RCTCxxBridge is a React Native internal class; its header is not public. We
 * declare only the subset we need (the runtime pointer getter) so the compiler
 * can type-check our cast and method call without importing private headers.
 *
 * This method exists in RN 0.64+ (declared in RCTCxxBridge+Private.h). It returns
 * a facebook::jsi::Runtime * cast through void* so we don't need JSI in this
 * declaration - we re-cast at the call site after including <jsi/jsi.h> above.
 * Returns nil if the runtime has not been initialised yet.
 */
@interface RCTCxxBridge : NSObject
- (void *)runtime;
@end
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

/**
 * Result of a JSI global read attempt - uses std::string to stay in C++ territory
 * and avoid ARC complications with NSString* in a C struct.
 */
struct SherloJsErrorCpp {
    std::string name;
    std::string message;
    std::string stack;
    bool valid = false;
};

/**
 * Reads global.__sherloLastJsError from the JSI Runtime pointed to by runtimePtr.
 *
 * Thread-safety note:
 *   On old-arch iOS, RCTCxxBridge.handleError: fires on the JS thread (via
 *   RCTMessageThread::tryFunc → m_errorBlock) AFTER the JS engine has finished
 *   evaluating the bundle.  The Runtime is still alive; no JS is currently
 *   executing, so JSI reads and short evaluations are safe to call from here.
 *
 * Two-path strategy:
 *
 *   Path 1 - direct getProperty: fast, zero JS execution overhead.  Works in the
 *     normal case where the Hermes runtime is quiescent after bundle evaluation
 *     and the polyfill has already set global.__sherloLastJsError.
 *
 *   Path 2 - evaluateJavaScript fallback: a tiny self-contained IIFE reads
 *     globalThis.__sherloLastJsError and returns the fields joined by "|||".
 *     Used when Path 1's getProperty call throws or returns a non-object (e.g.
 *     when the Hermes heap is in a transient state that prevents direct property
 *     access from native).  evaluateJavaScript enters a fresh JS evaluation
 *     context rather than accessing the heap directly, which sidesteps the issue.
 *
 * Returns a struct with valid=false if runtimePtr is null, both paths fail, or the
 * recovered error object has an empty message.
 */
static SherloJsErrorCpp sherloReadLastJsError(void *runtimePtr) {
    SherloJsErrorCpp result;  // valid defaults to false
    if (!runtimePtr) return result;

    // ── Path 1: direct getProperty ───────────────────────────────────────────
    try {
        using namespace facebook::jsi;
        Runtime *rt = static_cast<Runtime *>(runtimePtr);

        Value prop = rt->global().getProperty(*rt, "__sherloLastJsError");
        if (prop.isObject()) {
            Object obj = prop.getObject(*rt);

            // Inline helper: safely read a string property, returning "" on any failure.
            auto readStr = [&](const char *key) -> std::string {
                try {
                    Value v = obj.getProperty(*rt, key);
                    if (v.isString()) {
                        return v.getString(*rt).utf8(*rt);
                    }
                } catch (...) {}
                return "";
            };

            result.name    = readStr("name");
            result.message = readStr("message");
            result.stack   = readStr("stack");
            if (result.name.empty()) result.name = "Error";
            result.valid   = true;
            return result;
        }
        // Property absent or not an object - fall through to Path 2.
    } catch (...) {
        // getProperty threw (e.g. Hermes state issue) - fall through to Path 2.
    }

    // ── Path 2: evaluateJavaScript fallback ──────────────────────────────────
    //
    // A tiny IIFE reads globalThis.__sherloLastJsError and returns the three
    // fields joined by "|||" (a separator that won't appear in normal JS error
    // messages or stack traces).  Returns null if the global is absent or the
    // message property is not a string.
    //
    // This path complements Path 1: if direct heap access fails, re-entering the
    // Hermes runtime via evaluateJavaScript typically succeeds because it goes
    // through the normal JS execution path rather than raw property access.
    try {
        using namespace facebook::jsi;
        Runtime *rt = static_cast<Runtime *>(runtimePtr);

        // Minimal Buffer implementation - no external JSI helpers needed.
        struct LiteralBuffer : public Buffer {
            const char *str_;
            size_t len_;
            explicit LiteralBuffer(const char *s) : str_(s), len_(strlen(s)) {}
            size_t size() const override { return len_; }
            const uint8_t *data() const override {
                return reinterpret_cast<const uint8_t *>(str_);
            }
        };

        // Returns "name|||message|||stack" or null.
        static const char kScript[] =
            "(function(){"
            "try{"
            "var e=globalThis.__sherloLastJsError;"
            "if(e&&typeof e.message==='string'){"
            "return (e.name||'Error')+'|||'+(e.message||'')+'|||'+(e.stack||'');"
            "}"
            "}catch(ex){}"
            "return null;"
            "})()";

        auto buf = std::make_shared<LiteralBuffer>(kScript);
        Value evalResult = rt->evaluateJavaScript(buf, "sherlo:read");

        if (evalResult.isString()) {
            std::string combined = evalResult.getString(*rt).utf8(*rt);

            // Parse: name ||| message ||| stack
            const std::string sep = "|||";
            size_t sep1 = combined.find(sep);
            if (sep1 != std::string::npos) {
                result.name = combined.substr(0, sep1);
                if (result.name.empty()) result.name = "Error";
                size_t sep2 = combined.find(sep, sep1 + sep.size());
                if (sep2 != std::string::npos) {
                    result.message = combined.substr(sep1 + sep.size(),
                                                     sep2 - sep1 - sep.size());
                    result.stack   = combined.substr(sep2 + sep.size());
                } else {
                    result.message = combined.substr(sep1 + sep.size());
                }
                result.valid = !result.message.empty();
            }
        }
    } catch (...) {}

    return result;
}

#endif

// Helper: append a diag line to sherlo-diag.log via a freshly-allocated FileSystemHelper.
// Safe to call from any thread; never throws.
static void sherloAppendDiagLine(NSString *msg) {
    @try {
        FileSystemHelper *diagFs = [[FileSystemHelper alloc] init];
        NSString *line = [NSString stringWithFormat:@"%@\n", msg];
        [diagFs appendFile:@"sherlo-diag.log" content:line];
    } @catch (...) {}
}

@implementation SherloIOSExceptionHandler

// Installs the swizzles once via dispatch_once.
// On new arch the body is a no-op; on old arch two methods are swizzled.
+ (void)install {
    NSLog(@"[diag iOS] SherloIOSExceptionHandler initialized at module-load");
    sherloAppendDiagLine(@"[diag iOS] SherloIOSExceptionHandler initialized at module-load");
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
#if !RCT_NEW_ARCH_ENABLED
        [self swizzleRCTExceptionsManager];
        [self swizzleRCTCxxBridge];
#else
        NSLog(@"[diag iOS] new-arch: skipping swizzle installs (RCT_NEW_ARCH_ENABLED)");
        sherloAppendDiagLine(@"[diag iOS] new-arch: skipping swizzle installs (RCT_NEW_ARCH_ENABLED)");
#endif
    });
}

#if !RCT_NEW_ARCH_ENABLED

// Swizzles RCTExceptionsManager.reportFatalException:stack:exceptionId: to write
// a JS_ERROR protocol entry when a fatal JS exception is thrown.
// Only writes if in testing mode and no error has been written yet.
+ (void)swizzleRCTExceptionsManager {
    NSLog(@"[diag iOS] RCTExceptionsManager.reportFatalException: swizzle installing");
    sherloAppendDiagLine(@"[diag iOS] RCTExceptionsManager.reportFatalException: swizzle installing");
    Class cls = [RCTExceptionsManager class];
    SEL sel = @selector(reportFatalException:stack:exceptionId:);
    Method method = class_getInstanceMethod(cls, sel);
    if (!method) {
        NSLog(@"[diag iOS] RCTExceptionsManager.reportFatalException: method not found - swizzle skipped");
        sherloAppendDiagLine(@"[diag iOS] RCTExceptionsManager.reportFatalException: method not found - swizzle skipped");
        return;
    }

    FileSystemHelper *fs = [[FileSystemHelper alloc] init];
    IMP originalIMP = method_getImplementation(method);

    IMP newIMP = imp_implementationWithBlock(^(id selfObj, NSString *message, NSArray *stack, double exceptionId) {
        NSLog(@"[diag iOS] reportFatalException: swizzle FIRED with message: %@", message ?: @"(nil)");
        sherloAppendDiagLine([NSString stringWithFormat:@"[diag iOS] reportFatalException: swizzle FIRED with message: %@", message ?: @"(nil)"]);
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
    NSLog(@"[diag iOS] RCTExceptionsManager.reportFatalException: swizzle installed");
    sherloAppendDiagLine(@"[diag iOS] RCTExceptionsManager.reportFatalException: swizzle installed");
}

// Swizzles RCTCxxBridge.handleError: to write a JS_ERROR entry for bridge-level
// errors (e.g. bundle eval crashes on old-arch where BatchedBridge is not ready).
//
// When a JS module factory throws before BatchedBridge is initialised, the bridge
// receives a secondary "Could not get BatchedBridge" exception rather than the
// original JS error.  The polyfill (metro/polyfill.js) writes
// global.__sherloLastJsError before its failing bridge-call attempt, so we can
// recover the real message by reading that global via JSI.
//
// handleError: fires on the JS thread (via RCTMessageThread::tryFunc → m_errorBlock)
// after the JS engine has finished evaluating the bundle but before _reactInstance
// is torn down.  The Runtime is still alive and idle, making JSI reads safe.
// Falls back to error.localizedDescription if the JSI read fails or finds nothing.
+ (void)swizzleRCTCxxBridge {
    NSLog(@"[diag iOS] RCTCxxBridge.handleError: swizzle installing");
    sherloAppendDiagLine(@"[diag iOS] RCTCxxBridge.handleError: swizzle installing");
    Class cls = NSClassFromString(@"RCTCxxBridge");
    if (!cls) {
        NSLog(@"[diag iOS] RCTCxxBridge.handleError: class not found - swizzle skipped");
        sherloAppendDiagLine(@"[diag iOS] RCTCxxBridge.handleError: class not found - swizzle skipped");
        return;
    }
    SEL sel = NSSelectorFromString(@"handleError:");
    Method method = class_getInstanceMethod(cls, sel);
    if (!method) {
        NSLog(@"[diag iOS] RCTCxxBridge.handleError: method not found - swizzle skipped");
        sherloAppendDiagLine(@"[diag iOS] RCTCxxBridge.handleError: method not found - swizzle skipped");
        return;
    }

    FileSystemHelper *fs = [[FileSystemHelper alloc] init];
    IMP originalIMP = method_getImplementation(method);

    IMP newIMP = imp_implementationWithBlock(^(id selfObj, NSError *error) {
        NSLog(@"[diag iOS] handleError: swizzle FIRED with error: %@", error.localizedDescription ?: @"(nil)");
        sherloAppendDiagLine([NSString stringWithFormat:@"[diag iOS] handleError: swizzle FIRED with error: %@", error.localizedDescription ?: @"(nil)"]);
        if (!sJsErrorWritten && [[SherloModuleCore currentMode] isEqualToString:@"testing"]) {
            sJsErrorWritten = YES;

            NSString *name  = @"Error";
            NSString *msg   = nil;
            NSString *stack = @"";

            // Attempt to recover the original JS error from the global written by
            // the polyfill before it attempted the (failing) bridge call.
            void *runtimePtr = nil;
            @try {
                runtimePtr = [((RCTCxxBridge *)selfObj) runtime];
            } @catch (...) {}

            if (runtimePtr) {
                SherloJsErrorCpp jsErr = sherloReadLastJsError(runtimePtr);
                if (jsErr.valid && !jsErr.message.empty()) {
                    name  = [NSString stringWithUTF8String:jsErr.name.c_str()];
                    msg   = [NSString stringWithUTF8String:jsErr.message.c_str()];
                    stack = [NSString stringWithUTF8String:jsErr.stack.c_str()];
                }
            }

            // Fallback: use whatever the bridge provided (secondary exception message).
            if (!msg || msg.length == 0) {
                msg = error.localizedDescription ?: @"RCTCxxBridge error";
            }

            [ProtocolHelper writeEarlyJsError:fs name:name message:msg stack:stack];
        }
        typedef void (*Fn)(id, SEL, NSError *);
        ((Fn)originalIMP)(selfObj, sel, error);
    });

    method_setImplementation(method, newIMP);
    NSLog(@"[diag iOS] RCTCxxBridge.handleError: swizzle installed");
    sherloAppendDiagLine(@"[diag iOS] RCTCxxBridge.handleError: swizzle installed");
}

#endif

@end
