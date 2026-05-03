/*
 * Sherlo JSI bindings — sets globalThis.__sherloRuntimeMode_v1 BEFORE bundle eval.
 *
 * Maps to the Java SherloModule class that declares the native method
 * getBindingsInstaller(). The RN new-arch runtime calls this before any JS
 * module factories are evaluated.
 *
 * Production safety: in production the mode is 'default', so the metro polyfill
 * (metro/polyfill.js) gates on __sherloRuntimeMode_v1 at the top of its IIFE
 * and returns immediately — zero ErrorUtils wrapping, zero __d wrapping.
 */
#pragma once

#include <ReactCommon/BindingsInstallerHolder.h>
#include <fbjni/fbjni.h>
#include <jsi/jsi.h>

namespace sherlo {

class SherloModuleJSIBindings
    : public facebook::jni::JavaClass<SherloModuleJSIBindings> {
 public:
  // Must match the Java class that declares the native method.
  static constexpr const char *kJavaDescriptor =
      "Lio/sherlo/storybookreactnative/SherloModule;";

  static void registerNatives();

 private:
  static facebook::jni::local_ref<
      facebook::react::BindingsInstallerHolder::javaobject>
  getBindingsInstaller(
      facebook::jni::alias_ref<SherloModuleJSIBindings> jobj);
};

} // namespace sherlo
