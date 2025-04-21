#pragma once
#include <jni.h>

#ifdef __cplusplus
extern "C" {
#endif

JNIEXPORT jstring JNICALL
Java_io_sherlo_storybookreactnative_shadowserializer_ShadowSerializerModule_nativeGetShadowTreeData(
    JNIEnv *env,
    jobject /* this */,
    jint surfaceId);

#ifdef __cplusplus
}
#endif
