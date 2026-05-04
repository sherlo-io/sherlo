#include "SherloModuleJSIBindings.h"

namespace sherlo {

using namespace facebook;
using namespace facebook::jni;
using namespace facebook::jsi;
using namespace facebook::react;

void SherloModuleJSIBindings::registerNatives() {
  javaClassLocal()->registerNatives({
      makeNativeMethod(
          "getBindingsInstaller",
          SherloModuleJSIBindings::getBindingsInstaller),
  });
}

local_ref<BindingsInstallerHolder::javaobject>
SherloModuleJSIBindings::getBindingsInstaller(
    alias_ref<SherloModuleJSIBindings> /*jobj*/) {

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

  return BindingsInstallerHolder::newObjectCxxArgs(
      // Runs on the JS thread BEFORE bundle eval. Sets globalThis.__sherloRuntimeMode_v1
      // so the polyfill (metro/polyfill.js) can gate at install time — zero side effects
      // when mode = 'default' (production).
      [mode](Runtime &runtime, const std::shared_ptr<CallInvoker> &) {
        try {
          runtime.global().setProperty(
              runtime,
              "__sherloRuntimeMode_v1",
              String::createFromUtf8(runtime, mode));
        } catch (...) {
          // Swallow ALL exceptions. A Sherlo binding failure must never
          // crash the customer's app.
        }
      });
}

} // namespace sherlo
