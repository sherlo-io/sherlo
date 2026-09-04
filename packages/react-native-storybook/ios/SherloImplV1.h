/**
 * THE FROZEN ABI between the shim (compiled into the customer's binary) and the
 * implementation (injected at runner time, owned entirely by Sherlo).
 *
 * Everything in this file is a promise to customers: it ships inside their app
 * and cannot be changed without a rebuild on their side. So it holds function
 * pointers and nothing else - no behaviour, no business logic, no story of what
 * Sherlo actually does. Adding a capability means writing a new implementation
 * that fills in the same slots differently, not changing this file.
 *
 * There are exactly six slots, mirroring the six methods on the TurboModule
 * spec. Four are dedicated for reasons of timing or hot-path cost; the other two
 * - `invoke` and `invokeSync` - are the generic transports through which every
 * capability Sherlo will ever have must pass. Screenshots, settle detection,
 * scrolling, inspector data, keyboard suppression and whatever is invented next
 * are all names on `invoke`, never new slots here.
 *
 * `abiVersion` is what makes that safe. The shim refuses an implementation whose
 * version it does not know, BY NAME, rather than calling a garbage pointer.
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
  const char *implVersion;

  /**
   * SYNCHRONOUS. This is the hard one.
   *
   * The real SDK reads its mode from inside the bundle-evaluation IIFE, before
   * any module runs, and a JSI-global gate was already tried and caused an
   * Android race. So the answer has to be available the instant JS asks, with no
   * promise, no callback and no chance to await anything.
   *
   * The injected implementation is loaded pre-main, long before the JS runtime
   * exists, so by the time this can possibly be called it is already registered.
   * That ordering is the entire reason this design works.
   *
   * Returns a JSON OBJECT encoded as a string. The shim parses it into the
   * dictionary the TurboModule must return; parsing is mechanism, so the shim
   * may do it without learning anything about what the keys mean.
   */
  NSString *_Nonnull (*getSherloConstants)(void);

  /**
   * SYNCHRONOUS, and called from the error path where nothing else is
   * guaranteed to work. Must never throw.
   */
  BOOL (*reportEarlyJsError)(NSString *name, NSString *message, NSString *stack);

  /**
   * The protocol hot path - a 500ms ACK poll carrying base64 payloads. Dedicated
   * rather than routed through `invoke` because a JSON envelope would tax every
   * beat of every capture.
   */
  void (*appendFile)(NSString *path,
                     NSString *base64Content,
                     SherloResolveBlock resolve,
                     SherloRejectBlock reject);
  void (*readFile)(NSString *path, SherloResolveBlock resolve, SherloRejectBlock reject);

  /**
   * EVERYTHING ELSE, forever.
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
   * The synchronous half of the same transport, for the few calls that cannot
   * await. A synchronous call has no reject channel, so the result is always an
   * ENVELOPE: `{"ok":true,"value":<json>}` or
   * `{"ok":false,"code":"UNKNOWN_METHOD","message":"..."}`.
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
