#include "SherloModuleJSIBindings.h"
#include <android/log.h>
#define SHERLO_TAG "Sherlo"

namespace sherlo {

using namespace facebook;
using namespace facebook::jni;
using namespace facebook::jsi;
using namespace facebook::react;

void SherloModuleJSIBindings::registerNatives() {
  __android_log_print(ANDROID_LOG_INFO, SHERLO_TAG, "registerNatives() called");
  javaClassLocal()->registerNatives({
      makeNativeMethod(
          "getBindingsInstaller",
          SherloModuleJSIBindings::getBindingsInstaller),
  });
}

local_ref<BindingsInstallerHolder::javaobject>
SherloModuleJSIBindings::getBindingsInstaller(
    alias_ref<SherloModuleJSIBindings> /*jobj*/) {

  __android_log_print(ANDROID_LOG_INFO, SHERLO_TAG, "getBindingsInstaller native method invoked by RN runtime");

  // Read the current mode from SherloModuleCore's static getCurrentMode().
  // Safe to call at any point — falls back to 'default' if core not yet init.
  std::string mode = "default";
  try {
    auto coreClass =
        findClassStatic("io/sherlo/storybookreactnative/SherloModuleCore");
    auto getModeFn =
        coreClass->getStaticMethod<JString()>("getCurrentMode");
    auto modeRef = getModeFn(coreClass);
    if (modeRef) {
      mode = modeRef->toStdString();
    }
  } catch (...) {
    // Fall through with mode = "default"
  }

  __android_log_print(ANDROID_LOG_INFO, SHERLO_TAG,
      "installJSIBindingsWithRuntime fired, mode=%s", mode.c_str());

  return BindingsInstallerHolder::newObjectCxxArgs(
      // This lambda runs on the JS thread BEFORE bundle eval starts.
      // Production safety: mode is 'default' in production builds, so the
      // polyfill (metro/polyfill.js) immediately returns — no __r wrapping.
      [mode](Runtime &runtime, const std::shared_ptr<CallInvoker> &) {
        try {
          runtime.global().setProperty(
              runtime,
              "__sherloRuntimeMode_v1",
              String::createFromUtf8(runtime, mode));
          __android_log_print(ANDROID_LOG_INFO, SHERLO_TAG,
              "__sherloRuntimeMode_v1 set successfully");
        } catch (...) {
          __android_log_print(ANDROID_LOG_ERROR, SHERLO_TAG,
              "installJSIBindingsWithRuntime FAILED with C++ exception");
          // Swallow ALL exceptions. A Sherlo binding failure must never
          // crash the customer's app.
        }
      });
}

} // namespace sherlo
