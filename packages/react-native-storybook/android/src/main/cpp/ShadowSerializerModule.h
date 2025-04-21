#pragma once

#ifdef __cplusplus
extern "C" {
#endif

#include <jni.h>

JNIEXPORT jstring JNICALL
Java_io_sherlo_storybookreactnative_InspectorHelper_nativeGetShadowTreeData(
    JNIEnv *env,
    jclass clazz,
    jint surfaceId);

#ifdef __cplusplus
}
#endif
