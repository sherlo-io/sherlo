#include <fbjni/fbjni.h>
#include <android/log.h>
#include "SherloModuleJSIBindings.h"

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM *vm, void *) {
  __android_log_print(ANDROID_LOG_INFO, "Sherlo", "JNI_OnLoad fired");
  jint result = facebook::jni::initialize(vm, [] {
    sherlo::SherloModuleJSIBindings::registerNatives();
  });
  __android_log_print(ANDROID_LOG_INFO, "Sherlo", "JNI_OnLoad: registerNatives complete");
  return result;
}
