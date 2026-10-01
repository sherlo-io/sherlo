// The JNI face of the native core on Android: three calls SherloCoreLoader.java declares `native`.
// Compiled into the same stripped libsherlocore.so as the core itself, so nothing here ships as source.
#include <jni.h>
#include <stdint.h>
#include "sherlo_core.h"

JNIEXPORT jstring JNICALL
Java_io_sherlo_storybookreactnative_SherloCoreLoader_nativeVersion(JNIEnv *env, jclass type) {
  return (*env)->NewStringUTF(env, sherlo_core_version());
}

JNIEXPORT jint JNICALL
Java_io_sherlo_storybookreactnative_SherloCoreLoader_nativeAbi(JNIEnv *env, jclass type) {
  return sherlo_core_abi();
}

JNIEXPORT jint JNICALL
Java_io_sherlo_storybookreactnative_SherloCoreLoader_nativeCountDifferentPixels(
    JNIEnv *env, jclass type, jbyteArray rgba_a, jbyteArray rgba_b, jint width, jint height,
    jdouble threshold) {
  jbyte *a = (*env)->GetByteArrayElements(env, rgba_a, NULL);
  jbyte *b = (*env)->GetByteArrayElements(env, rgba_b, NULL);
  int different = sherlo_core_count_different_pixels((const uint8_t *)a, (const uint8_t *)b, width,
                                                     height, threshold);
  (*env)->ReleaseByteArrayElements(env, rgba_a, a, JNI_ABORT);
  (*env)->ReleaseByteArrayElements(env, rgba_b, b, JNI_ABORT);
  return different;
}
