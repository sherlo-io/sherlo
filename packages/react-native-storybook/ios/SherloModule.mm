/**
 * THE SHIM. This is the code that ships inside a customer's app.
 *
 * getSherloConstants and setMode (the one invokeSync builtin) prefer whatever
 * implementation SherloShimRegisterImplV1 registered, and fall back to the
 * pre-main read SherloModuleCore already did when nothing is injected;
 * reportEarlyJsError, appendFile and readFile forward to the implementation
 * unconditionally, because the shim writes nothing to protocol.sherlo on its
 * own. `invoke`/`invokeSync` are pure transports - the shim never inspects the
 * name it is carrying.
 */
#import "SherloModule.h"
#import <React/RCTUtils.h>
#import <React/RCTUIManagerUtils.h>
#import <React/RCTBridge.h>
#import "SherloModuleCore.h"
#import "SherloImplV1.h"

#import <atomic>

@implementation SherloModule

RCT_EXPORT_MODULE(SherloModule)

@synthesize bridge = _bridge;

static SherloModuleCore *core;

// This runs automatically when the dynamic library is loaded
__attribute__((constructor))
static void SherloEarlyInit(void) {
  core = [[SherloModuleCore alloc] init];
}

/**
 * Indicates that this module should be initialized on the main thread.
 */
+ (BOOL)requiresMainQueueSetup {
    return YES;
}

// Specifies the dispatch queue on which the module's methods should be executed.
- (dispatch_queue_t)methodQueue {
    return RCTGetUIManagerQueue();
}

// ---------------------------------------------------------------------------
// The dispatch table.
// ---------------------------------------------------------------------------

/**
 * Written once, pre-main, by the injected dylib's load constructor. Read later,
 * from whichever thread JS happens to call on. Atomic because "written on one
 * thread before any read on another" needs the release/acquire pair to be
 * guaranteed, not merely true in practice on arm64.
 */
static std::atomic<SherloImplV1 *> gImpl{nullptr};

/** Diagnostics only - never consulted for dispatch. */
static NSString *gRefusedReason = nil;

extern "C" __attribute__((used, visibility("default")))
void SherloShimRegisterImplV1(SherloImplV1 *impl) {
  if (impl == NULL) {
    gRefusedReason = @"implementation registered a NULL struct";
    return;
  }

  // Refuse by name rather than calling into an ABI we do not understand. A
  // wrong-version implementation is a Sherlo bug the customer cannot fix, so it
  // has to be loud on our side and harmless on theirs.
  if (impl->abiVersion != SHERLO_ABI_VERSION_V1) {
    gRefusedReason = [NSString stringWithFormat:
        @"implementation declares ABI v%d, this shim speaks v%d",
        impl->abiVersion, SHERLO_ABI_VERSION_V1];
    NSLog(@"[SherloModule] REFUSED: %@", gRefusedReason);
    return;
  }

  if (impl->getSherloConstants == NULL || impl->reportEarlyJsError == NULL ||
      impl->appendFile == NULL || impl->readFile == NULL || impl->invoke == NULL ||
      impl->invokeSync == NULL) {
    gRefusedReason = @"implementation left a required slot NULL";
    NSLog(@"[SherloModule] REFUSED: %@", gRefusedReason);
    return;
  }

  gImpl.store(impl, std::memory_order_release);
  NSLog(@"[SherloModule] accepted implementation %s (ABI v%d)",
        impl->implVersion ? impl->implVersion : "(unnamed)", impl->abiVersion);
}

// ---------------------------------------------------------------------------
// The six-method spec.
// ---------------------------------------------------------------------------

/**
 * SYNCHRONOUS, same as invokeSync's setMode: the implementation wins when
 * registered (see SherloImplV1.h's getSherloConstants doc - by the time this
 * can possibly be called, an implementation loaded pre-main is already
 * registered), and the shim's own pre-main read (SherloModuleCore) is the
 * FALLBACK for a customer running with nothing injected at all.
 */
- (NSDictionary *)getSherloConstants {
    SherloImplV1 *impl = gImpl.load(std::memory_order_acquire);
    if (impl != NULL) {
        NSString *json = impl->getSherloConstants();
        NSData *data = json ? [json dataUsingEncoding:NSUTF8StringEncoding] : nil;
        id parsed = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
        if ([parsed isKindOfClass:NSDictionary.class]) {
            return parsed;
        }
    }
    return [core getSherloConstants];
}

- (NSNumber *)reportEarlyJsError:(NSString *)name
                         message:(NSString *)message
                           stack:(NSString *)stack
{
  SherloImplV1 *impl = gImpl.load(std::memory_order_acquire);
  if (impl == NULL) {
    return @NO;
  }
  return @(impl->reportEarlyJsError(name ?: @"", message ?: @"", stack ?: @""));
}

- (void)appendFile:(NSString *)path
          content:(NSString *)content
          resolve:(RCTPromiseResolveBlock)resolve
           reject:(RCTPromiseRejectBlock)reject
{
  SherloImplV1 *impl = gImpl.load(std::memory_order_acquire);
  if (impl == NULL) {
    reject(@"sherlo_no_implementation", @"the shim is present but nothing was injected", nil);
    return;
  }
  impl->appendFile(path ?: @"", content ?: @"",
                   ^(NSString *value) { resolve(value); },
                   ^(NSString *code, NSString *message) { reject(code, message, nil); });
}

- (void)readFile:(NSString *)path
        resolve:(RCTPromiseResolveBlock)resolve
         reject:(RCTPromiseRejectBlock)reject
{
  SherloImplV1 *impl = gImpl.load(std::memory_order_acquire);
  if (impl == NULL) {
    reject(@"sherlo_no_implementation", @"the shim is present but nothing was injected", nil);
    return;
  }
  impl->readFile(path ?: @"",
                 ^(NSString *value) { resolve(value); },
                 ^(NSString *code, NSString *message) { reject(code, message, nil); });
}

- (void)invoke:(NSString *)name
      argsJson:(NSString *)argsJson
       resolve:(RCTPromiseResolveBlock)resolve
        reject:(RCTPromiseRejectBlock)reject
{
  SherloImplV1 *impl = gImpl.load(std::memory_order_acquire);
  if (impl == NULL) {
    // Reject rather than resolve-with-nothing. A caller awaiting this must be
    // able to tell "Sherlo is not attached" from "Sherlo did the work and the
    // answer was empty", and a resolved Promise cannot carry that difference.
    reject(@"sherlo_no_implementation", @"the shim is present but nothing was injected", nil);
    return;
  }
  impl->invoke(name ?: @"", argsJson ?: @"{}",
               ^(NSString *value) { resolve(value); },
               ^(NSString *code, NSString *message) { reject(code, message, nil); });
}

/**
 * THE SHIM'S ONE BUILTIN.
 *
 * `setMode` is reachable only through invokeSync - it is the developer path,
 * openStorybook()/toggleStorybook() called on a machine with nothing injected,
 * so it has to answer synchronously with no implementation in the picture at
 * all. Deliberately mechanical: set a flag, reload. No policy, because policy
 * frozen at a customer's build can never be corrected. An injected
 * implementation is consulted FIRST and can override it - see invokeSync below.
 *
 * Returns nil when the name is not a builtin, so the caller falls through.
 */
static NSString *SherloModuleBuiltin(NSString *name, NSDictionary *args) {
  if ([name isEqualToString:@"setMode"]) {
    NSString *mode = args[@"mode"];
    if (![mode isKindOfClass:NSString.class]) {
      return @"{\"ok\":false,\"code\":\"BAD_ARGS\",\"message\":\"setMode needs a mode string\"}";
    }

    [core setMode:mode reload:[args[@"reload"] boolValue]];
    return @"{\"ok\":true,\"value\":null}";
  }

  return nil;
}

- (NSString *)invokeSync:(NSString *)name argsJson:(NSString *)argsJson {
  SherloImplV1 *impl = gImpl.load(std::memory_order_acquire);

  // The implementation wins when present, so a test run can behave differently
  // from a developer toggle. The builtin is the FALLBACK, not an override.
  if (impl != NULL) {
    // Copied immediately: the implementation owns the returned string only
    // until its next call on this thread.
    NSString *result = [NSString stringWithString:impl->invokeSync(name ?: @"", argsJson ?: @"{}")];

    // An implementation that does not know this name is not an error here -
    // the shim may still handle it. That is what lets a NEWER customer binary
    // work with an OLDER implementation.
    if (![result containsString:@"UNKNOWN_METHOD"]) return result;
  }

  NSData *data = [(argsJson ?: @"{}") dataUsingEncoding:NSUTF8StringEncoding];
  id parsed = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
  NSDictionary *args = [parsed isKindOfClass:NSDictionary.class] ? parsed : @{};

  NSString *builtin = SherloModuleBuiltin(name ?: @"", args);
  if (builtin != nil) return builtin;

  if (impl == NULL) {
    return @"{\"ok\":false,\"code\":\"sherlo_no_implementation\","
           @"\"message\":\"the shim is present but nothing was injected\"}";
  }
  return @"{\"ok\":false,\"code\":\"UNKNOWN_METHOD\",\"message\":\"no implementation and no builtin\"}";
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeSherloModuleSpecJSI>(params);
}

@end
