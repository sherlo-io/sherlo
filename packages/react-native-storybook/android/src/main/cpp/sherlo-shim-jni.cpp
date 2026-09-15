/**
 * The Android shim's native half - compiled INTO the customer's APK.
 *
 * Direction is reversed from iOS. There, the shim is statically linked into
 * the main executable so the injected library can PUSH into it from its own
 * constructor. Here, LD_PRELOAD loads the injected library at process start,
 * long before any of the app's JNI libraries exist, so there is nothing to
 * push into. The shim PULLS instead, lazily, the first time JS calls in.
 *
 * A preloaded library lands in the linker's global group, which is visible
 * from the app's classloader namespace, so dlsym(RTLD_DEFAULT, ...) finds it.
 *
 * Nothing below knows what Sherlo does. `invoke`/`invokeSync` forward a string
 * they never inspect.
 */
#include <jni.h>
#include <android/log.h>
#include <dlfcn.h>
#include <string>

#define TAG "SherloShim"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN, TAG, __VA_ARGS__)

#define SHERLO_ABI_VERSION_V1 1

typedef void (*SherloResolve)(void *ctx, const char *json);
typedef void (*SherloReject)(void *ctx, const char *code, const char *message);

/**
 * Declared identically on both sides (and identically to ios/SherloImplV1.h);
 * abiVersion is what makes that safe.
 *
 * getSherloConstants is SYNCHRONOUS, same as on iOS: by the time this can
 * possibly be called, an implementation loaded via LD_PRELOAD is already
 * resolved. A registered implementation's answer wins; SherloModuleCore's own
 * pre-main read is the fallback for a customer running with nothing injected.
 */
typedef struct SherloImplV1 {
  int abiVersion;
  const char *implVersion;
  const char *(*getSherloConstants)(void);
  int (*reportEarlyJsError)(const char *name, const char *message, const char *stack);
  void (*appendFile)(const char *path, const char *base64Content,
                     void *ctx, SherloResolve resolve, SherloReject reject);
  void (*readFile)(const char *path, void *ctx, SherloResolve resolve, SherloReject reject);
  void (*invoke)(const char *name, const char *argsJson,
                 void *ctx, SherloResolve resolve, SherloReject reject);
  const char *(*invokeSync)(const char *name, const char *argsJson);
} SherloImplV1;

typedef struct SherloHostV1 {
  int hostVersion;
  JavaVM *vm;
  void (*runOnUiThread)(void (*fn)(void *), void *ctx);
  jobject (*acquireCurrentActivity)(void);
} SherloHostV1;

typedef SherloImplV1 *(*SherloGetImplFn)(void);
typedef void (*SherloSetHostFn)(const SherloHostV1 *);

#define SHERLO_HOST_VERSION_V1 1

static JavaVM *gVm = nullptr;
static SherloImplV1 *gImpl = nullptr;
static std::string gRefusedReason;
static bool gResolved = false;

/**
 * The shim module class, cached as a GLOBAL REF at JNI_OnLoad.
 *
 * It cannot be looked up on demand: FindClass resolves against the classloader
 * of the frame that called into native, and by the time the implementation is
 * resolved (lazily, from JS) that frame has no application classes visible.
 * JNI_OnLoad runs from System.loadLibrary inside the module's own static
 * initialiser, so the app classloader is on the stack there.
 */
static jclass gModuleClass = nullptr;

static JNIEnv *shimEnv(bool *attached) {
  *attached = false;
  if (gVm == nullptr) return nullptr;

  JNIEnv *env = nullptr;
  if (gVm->GetEnv((void **)&env, JNI_VERSION_1_6) == JNI_OK && env != nullptr) return env;
  if (gVm->AttachCurrentThread(&env, nullptr) != JNI_OK) return nullptr;
  *attached = true;
  return env;
}

// ---------------------------------------------------------------------------
// The two services the shim lends the implementation.
//
// An injected native library ships no dex, so it cannot define a Java class,
// so it cannot construct a Runnable, so it cannot post to the main thread -
// and without the main thread it cannot scroll, lay out, or safely walk a
// view tree. Both are mechanism: the shim still never learns the name of a
// single Sherlo capability.
// ---------------------------------------------------------------------------

/** Posts fn(ctx) onto the app's main looper, through the module's Handler. */
static void shimRunOnUiThread(void (*fn)(void *), void *ctx) {
  bool attached = false;
  JNIEnv *env = shimEnv(&attached);
  if (env == nullptr) return;

  if (gModuleClass != nullptr) {
    jmethodID postToMainThread =
        env->GetStaticMethodID(gModuleClass, "postToMainThread", "(JJ)V");
    if (postToMainThread != nullptr) {
      env->CallStaticVoidMethod(gModuleClass, postToMainThread,
                                (jlong)(intptr_t)fn, (jlong)(intptr_t)ctx);
    }
  }
  if (env->ExceptionCheck()) env->ExceptionClear();

  if (attached) gVm->DetachCurrentThread();
}

/** A NEW GLOBAL REF to the foreground Activity, or nullptr. Caller deletes it. */
static jobject shimAcquireCurrentActivity(void) {
  bool attached = false;
  JNIEnv *env = shimEnv(&attached);
  if (env == nullptr) return nullptr;

  jobject global = nullptr;
  if (gModuleClass != nullptr) {
    jmethodID currentActivity =
        env->GetStaticMethodID(gModuleClass, "currentActivity", "()Landroid/app/Activity;");
    if (currentActivity != nullptr) {
      jobject activity = env->CallStaticObjectMethod(gModuleClass, currentActivity);
      if (!env->ExceptionCheck() && activity != nullptr) {
        global = env->NewGlobalRef(activity);
      }
    }
  }
  if (env->ExceptionCheck()) env->ExceptionClear();

  if (attached) gVm->DetachCurrentThread();
  return global;
}

static SherloHostV1 gHostInstance;

// ---------------------------------------------------------------------------
// The handover.
// ---------------------------------------------------------------------------

/** Resolved once, lazily, on first use from the Java side. */
static void resolveImpl() {
  if (gResolved) return;
  gResolved = true;

  void *symbol = dlsym(RTLD_DEFAULT, "SherloGetImplV1");
  if (symbol == nullptr) {
    gRefusedReason = "no SherloGetImplV1 in this process - nothing was injected";
    LOGI("%s", gRefusedReason.c_str());
    return;
  }

  SherloImplV1 *impl = ((SherloGetImplFn)symbol)();
  if (impl == nullptr) {
    gRefusedReason = "SherloGetImplV1 returned NULL";
    LOGW("REFUSED: %s", gRefusedReason.c_str());
    return;
  }

  // Refuse by name rather than calling into an ABI we do not understand. A
  // wrong-version implementation is a Sherlo bug the customer cannot fix, so
  // it has to be loud on our side and harmless on theirs.
  if (impl->abiVersion != SHERLO_ABI_VERSION_V1) {
    char buffer[192];
    snprintf(buffer, sizeof(buffer),
             "implementation declares ABI v%d, this shim speaks v%d",
             impl->abiVersion, SHERLO_ABI_VERSION_V1);
    gRefusedReason = buffer;
    LOGW("REFUSED: %s", gRefusedReason.c_str());
    return;
  }

  if (impl->getSherloConstants == nullptr || impl->reportEarlyJsError == nullptr ||
      impl->appendFile == nullptr || impl->readFile == nullptr || impl->invoke == nullptr ||
      impl->invokeSync == nullptr) {
    gRefusedReason = "implementation left a required slot NULL";
    LOGW("REFUSED: %s", gRefusedReason.c_str());
    return;
  }

  // Lend the host services BEFORE the first call, and only to an
  // implementation we have already accepted.
  void *setHost = dlsym(RTLD_DEFAULT, "SherloSetHostV1");
  if (setHost != nullptr) {
    gHostInstance.hostVersion = SHERLO_HOST_VERSION_V1;
    gHostInstance.vm = gVm;
    gHostInstance.runOnUiThread = shimRunOnUiThread;
    gHostInstance.acquireCurrentActivity = shimAcquireCurrentActivity;
    ((SherloSetHostFn)setHost)(&gHostInstance);
  }

  gImpl = impl;
  LOGI("accepted implementation %s (ABI v%d)",
       impl->implVersion ? impl->implVersion : "(unnamed)", impl->abiVersion);
}

// ---------------------------------------------------------------------------
// Promise plumbing.
//
// `ctx` is a global ref to the Kotlin/Java Promise. The implementation calls
// back from whichever thread it finished on, so each callback attaches,
// settles the Promise exactly once, and releases the ref.
// ---------------------------------------------------------------------------

static void settlePromise(void *ctx, const char *method, const char *a, const char *b) {
  bool attached = false;
  JNIEnv *env = shimEnv(&attached);
  if (env == nullptr) return;

  if (gModuleClass != nullptr) {
    jmethodID settle = env->GetStaticMethodID(
        gModuleClass, method,
        b == nullptr ? "(Ljava/lang/Object;Ljava/lang/String;)V"
                     : "(Ljava/lang/Object;Ljava/lang/String;Ljava/lang/String;)V");
    if (settle != nullptr) {
      jstring first = env->NewStringUTF(a != nullptr ? a : "");
      if (b == nullptr) {
        env->CallStaticVoidMethod(gModuleClass, settle, (jobject)ctx, first);
      } else {
        jstring second = env->NewStringUTF(b);
        env->CallStaticVoidMethod(gModuleClass, settle, (jobject)ctx, first, second);
      }
    }
  }
  if (env->ExceptionCheck()) env->ExceptionClear();

  env->DeleteGlobalRef((jobject)ctx);
  if (attached) gVm->DetachCurrentThread();
}

static void resolveCallback(void *ctx, const char *json) {
  settlePromise(ctx, "resolvePromise", json, nullptr);
}

static void rejectCallback(void *ctx, const char *code, const char *message) {
  settlePromise(ctx, "rejectPromise", code, message != nullptr ? message : "");
}

// ---------------------------------------------------------------------------
// The JNI surface the Java module calls.
// ---------------------------------------------------------------------------

extern "C" {

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM *vm, void *) {
  gVm = vm;

  JNIEnv *env = nullptr;
  if (vm->GetEnv((void **)&env, JNI_VERSION_1_6) == JNI_OK && env != nullptr) {
    jclass local = env->FindClass("io/sherlo/storybookreactnative/SherloModule");
    if (local != nullptr) {
      gModuleClass = (jclass)env->NewGlobalRef(local);
      env->DeleteLocalRef(local);
    }
    if (env->ExceptionCheck()) env->ExceptionClear();
  }

  if (gModuleClass == nullptr) {
    LOGW("JNI_OnLoad could not cache SherloModule - Promise settlement will not work");
  }

  return JNI_VERSION_1_6;
}

/**
 * Returns nullptr (not a "no-implementation" sentinel JSON) when nothing is
 * registered, so the Java side's own fallback - SherloModuleCore's pre-main
 * read - can win instead. The implementation's answer is JSON already; it is
 * copied into a jstring immediately, since it is only valid until this
 * thread's next call into the implementation.
 */
JNIEXPORT jstring JNICALL
Java_io_sherlo_storybookreactnative_SherloModule_nativeGetSherloConstants(
    JNIEnv *env, jclass) {
  resolveImpl();
  if (gImpl == nullptr) return nullptr;

  const char *result = gImpl->getSherloConstants();
  return env->NewStringUTF(result != nullptr ? result : "{}");
}

JNIEXPORT jboolean JNICALL
Java_io_sherlo_storybookreactnative_SherloModule_nativeReportEarlyJsError(
    JNIEnv *env, jclass, jstring name, jstring message, jstring stack) {
  resolveImpl();
  if (gImpl == nullptr) return JNI_FALSE;

  const char *rawName = env->GetStringUTFChars(name, nullptr);
  const char *rawMessage = env->GetStringUTFChars(message, nullptr);
  const char *rawStack = env->GetStringUTFChars(stack, nullptr);

  int result = gImpl->reportEarlyJsError(rawName, rawMessage, rawStack);

  env->ReleaseStringUTFChars(name, rawName);
  env->ReleaseStringUTFChars(message, rawMessage);
  env->ReleaseStringUTFChars(stack, rawStack);
  return result ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT void JNICALL
Java_io_sherlo_storybookreactnative_SherloModule_nativeAppendFile(
    JNIEnv *env, jclass, jstring path, jstring content, jobject promise) {
  resolveImpl();
  jobject ctx = env->NewGlobalRef(promise);
  if (gImpl == nullptr) {
    rejectCallback(ctx, "sherlo_no_implementation",
                   "the shim is present but nothing was injected");
    return;
  }
  const char *rawPath = env->GetStringUTFChars(path, nullptr);
  const char *rawContent = env->GetStringUTFChars(content, nullptr);
  gImpl->appendFile(rawPath, rawContent, ctx, resolveCallback, rejectCallback);
  env->ReleaseStringUTFChars(path, rawPath);
  env->ReleaseStringUTFChars(content, rawContent);
}

JNIEXPORT void JNICALL
Java_io_sherlo_storybookreactnative_SherloModule_nativeReadFile(
    JNIEnv *env, jclass, jstring path, jobject promise) {
  resolveImpl();
  jobject ctx = env->NewGlobalRef(promise);
  if (gImpl == nullptr) {
    rejectCallback(ctx, "sherlo_no_implementation",
                   "the shim is present but nothing was injected");
    return;
  }
  const char *rawPath = env->GetStringUTFChars(path, nullptr);
  gImpl->readFile(rawPath, ctx, resolveCallback, rejectCallback);
  env->ReleaseStringUTFChars(path, rawPath);
}

JNIEXPORT void JNICALL
Java_io_sherlo_storybookreactnative_SherloModule_nativeInvoke(
    JNIEnv *env, jclass, jstring name, jstring argsJson, jobject promise) {
  resolveImpl();
  jobject ctx = env->NewGlobalRef(promise);
  if (gImpl == nullptr) {
    // Reject rather than resolve-with-nothing. A caller awaiting this must be
    // able to tell "Sherlo is not attached" from "Sherlo did the work and the
    // answer was empty", and a resolved Promise cannot carry that difference.
    rejectCallback(ctx, "sherlo_no_implementation",
                   "the shim is present but nothing was injected");
    return;
  }
  const char *rawName = env->GetStringUTFChars(name, nullptr);
  const char *rawArgs = env->GetStringUTFChars(argsJson, nullptr);
  gImpl->invoke(rawName, rawArgs, ctx, resolveCallback, rejectCallback);
  env->ReleaseStringUTFChars(name, rawName);
  env->ReleaseStringUTFChars(argsJson, rawArgs);
}

JNIEXPORT jstring JNICALL
Java_io_sherlo_storybookreactnative_SherloModule_nativeInvokeSync(
    JNIEnv *env, jclass, jstring name, jstring argsJson) {
  resolveImpl();
  if (gImpl == nullptr) {
    return env->NewStringUTF(
        "{\"ok\":false,\"code\":\"sherlo_no_implementation\","
        "\"message\":\"the shim is present but nothing was injected\"}");
  }
  const char *rawName = env->GetStringUTFChars(name, nullptr);
  const char *rawArgs = env->GetStringUTFChars(argsJson, nullptr);
  // Copied into a jstring immediately: the implementation owns the returned
  // buffer only until this thread's next invokeSync.
  const char *result = gImpl->invokeSync(rawName, rawArgs);
  jstring copy = env->NewStringUTF(result != nullptr ? result : "{}");
  env->ReleaseStringUTFChars(name, rawName);
  env->ReleaseStringUTFChars(argsJson, rawArgs);
  return copy;
}

/** Runs one posted main-thread task. Called from the Java Handler's Runnable. */
JNIEXPORT void JNICALL
Java_io_sherlo_storybookreactnative_SherloModule_nativeRunUiTask(
    JNIEnv *, jclass, jlong fnPtr, jlong ctxPtr) {
  auto fn = (void (*)(void *))(intptr_t)fnPtr;
  if (fn != nullptr) fn((void *)(intptr_t)ctxPtr);
}

}  // extern "C"
