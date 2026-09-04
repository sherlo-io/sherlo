/**
 * THE FROZEN ABI between the shim (compiled into the customer's binary) and the
 * implementation (injected at runner launch, owned entirely by Sherlo).
 *
 * Everything in this file is a promise to customers: it ships inside their app
 * and cannot be changed without a rebuild on their side. So it holds function
 * pointers and nothing else - no behaviour, no business logic, no story of what
 * Sherlo actually does. Adding a capability means writing a new implementation
 * that fills in the same slots differently, not changing this file.
 *
 * `getSherloConstants` has no slot here: mode/config/lastState/nativeVersion are
 * read by the shim itself, pre-main, from files already on disk before any
 * implementation could possibly be registered - see SherloModuleCore. The
 * implementation reads those frozen values off the shim; it never recomputes
 * them.
 *
 * `abiVersion` is what makes the rest of this safe. The shim refuses an
 * implementation whose version it does not know, BY NAME, rather than calling a
 * garbage pointer.
 */
#ifndef SherloImplV1_h
#define SherloImplV1_h

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

#define SHERLO_ABI_VERSION_V1 1

typedef void (^SherloResolveBlock)(NSString *value);
typedef void (^SherloRejectBlock)(NSString *code, NSString *message);

typedef struct SherloImplV1 {
  /** Must equal SHERLO_ABI_VERSION_V1, or the shim refuses the whole struct. */
  int abiVersion;

  /** Free-form, for diagnostics only. The shim never parses this. */
  const char *_Nullable implVersion;

  /**
   * Called from the error path where nothing else is guaranteed to work.
   * Must never throw.
   */
  BOOL (*reportEarlyJsError)(NSString *name, NSString *message, NSString *stack);

  /**
   * The protocol hot path - a 500ms ACK poll carrying base64 payloads. The shim
   * writes nothing to protocol.sherlo on its own; every byte crosses through
   * here.
   */
  void (*appendFile)(NSString *path,
                     NSString *base64Content,
                     SherloResolveBlock resolve,
                     SherloRejectBlock reject);
  void (*readFile)(NSString *path, SherloResolveBlock resolve, SherloRejectBlock reject);

  /**
   * EVERYTHING ELSE, forever: screenshots, settle, scroll, frame commit,
   * inspector data, sendNativeError, notifyGetStorybookCalled - and whatever is
   * invented later.
   *
   * `argsJson` is a JSON object; the resolved value is a JSON value. An unknown
   * `name` MUST reject with the code `UNKNOWN_METHOD` - never an unclassified
   * throw - so a newer implementation paired with an older customer binary
   * degrades deliberately instead of crashing.
   */
  void (*invoke)(NSString *name,
                 NSString *argsJson,
                 SherloResolveBlock resolve,
                 SherloRejectBlock reject);

  /**
   * The synchronous half of the same transport, for the one call that cannot
   * await: the mode read during bundle evaluation. A synchronous call has no
   * reject channel, so the result is always an ENVELOPE:
   * `{"ok":true,"value":<json>}` or `{"ok":false,"code":"UNKNOWN_METHOD","message":"..."}`.
   *
   * The returned string is owned by the implementation and is only valid until
   * the next call on the same thread. The shim copies it immediately.
   */
  NSString *_Nonnull (*invokeSync)(NSString *name, NSString *argsJson);
} SherloImplV1;

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Called by the injected dylib from its load constructor.
 *
 * The injected side finds this with dlsym(RTLD_DEFAULT, ...) because the shim is
 * statically linked into the main executable, and the main executable's symbols
 * are process-wide. Nothing needs to link against anything.
 */
void SherloShimRegisterImplV1(SherloImplV1 *impl);

#ifdef __cplusplus
}
#endif

NS_ASSUME_NONNULL_END

#endif /* SherloImplV1_h */
