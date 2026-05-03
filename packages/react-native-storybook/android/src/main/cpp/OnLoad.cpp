#include <fbjni/fbjni.h>
#include "SherloModuleJSIBindings.h"

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM *vm, void *) {
  return facebook::jni::initialize(vm, [] {
    sherlo::SherloModuleJSIBindings::registerNatives();
  });
}
