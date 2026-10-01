// The C core's JNI face on Android: the calls io.sherlo.storybookreactnative.CompiledCore declares
// `native`. Compiled into the same stripped libsherlocore.so as the core, whose own names stay
// hidden: only these entry points are exported.
//
// Screenshots arrive as android.graphics.Bitmap and are read in place through libjnigraphics, so
// no compare copies a pixel.
#include <android/bitmap.h>
#include <jni.h>
#include <stdint.h>

#include "sherlo_core.h"

JNIEXPORT jint JNICALL Java_io_sherlo_storybookreactnative_CompiledCore_nativeAbi(JNIEnv *env,
                                                                                 jclass type) {
  return sherlo_core_abi();
}

JNIEXPORT jstring JNICALL
Java_io_sherlo_storybookreactnative_CompiledCore_nativeVersion(JNIEnv *env, jclass type) {
  return (*env)->NewStringUTF(env, sherlo_core_version());
}

JNIEXPORT jlong JNICALL Java_io_sherlo_storybookreactnative_CompiledCore_nativeStillBegin(
    JNIEnv *env, jclass type, jint required_still_pairs, jint minimum_screenshots,
    jboolean counts_first_screenshot, jlong time_limit_ms, jdouble threshold, jboolean include_aa,
    jlong now_ms) {
  sherlo_still_params params;
  params.required_still_pairs = required_still_pairs;
  params.minimum_screenshots = minimum_screenshots;
  params.counts_first_screenshot = counts_first_screenshot ? 1 : 0;
  params.time_limit_ms = time_limit_ms;
  params.threshold = threshold;
  params.include_aa = include_aa ? 1 : 0;
  return (jlong)(intptr_t)sherlo_still_begin(&params, now_ms);
}

// Locks a Bitmap's pixels and describes them as a sherlo_image. Returns 0 when the Bitmap is not
// premultiplied RGBA8 or cannot be locked, and then nothing is left locked.
static int lock_image(JNIEnv *env, jobject bitmap, sherlo_image *image) {
  AndroidBitmapInfo info;
  if (AndroidBitmap_getInfo(env, bitmap, &info) != ANDROID_BITMAP_RESULT_SUCCESS) return 0;
  if (info.format != ANDROID_BITMAP_FORMAT_RGBA_8888) return 0;
  // Before API 30 these bits were zero, which reads as premultiplied - what ARGB_8888 is by default.
  // An opaque Bitmap's bytes are the same premultiplied or not.
  uint32_t alpha = info.flags & ANDROID_BITMAP_FLAGS_ALPHA_MASK;
  if (alpha != ANDROID_BITMAP_FLAGS_ALPHA_PREMUL && alpha != ANDROID_BITMAP_FLAGS_ALPHA_OPAQUE) {
    return 0;
  }

  void *pixels = NULL;
  if (AndroidBitmap_lockPixels(env, bitmap, &pixels) != ANDROID_BITMAP_RESULT_SUCCESS) return 0;
  image->pixels = (const uint8_t *)pixels;
  image->width = (int32_t)info.width;
  image->height = (int32_t)info.height;
  image->stride_bytes = (int32_t)info.stride;
  image->format = SHERLO_PIXELS_RGBA8_PREMULTIPLIED;
  return 1;
}

JNIEXPORT jint JNICALL Java_io_sherlo_storybookreactnative_CompiledCore_nativeStillStep(
    JNIEnv *env, jclass type, jlong state, jobject previous_bitmap, jobject current_bitmap,
    jlong now_ms, jboolean focus_was_cleared, jlongArray different_pixels_out) {
  // A Bitmap that cannot be read answers the bad-argument error, in the count as in the verdict.
  int64_t different_pixels = SHERLO_ERROR_BAD_ARGUMENT;
  int32_t verdict = SHERLO_ERROR_BAD_ARGUMENT;

  sherlo_image previous;
  sherlo_image current;
  if (lock_image(env, previous_bitmap, &previous)) {
    if (lock_image(env, current_bitmap, &current)) {
      verdict = sherlo_still_step((sherlo_still_state *)(intptr_t)state, &previous, &current,
                                  now_ms, focus_was_cleared ? 1 : 0, &different_pixels);
      AndroidBitmap_unlockPixels(env, current_bitmap);
    }
    AndroidBitmap_unlockPixels(env, previous_bitmap);
  }

  jlong different_pixels_answer = (jlong)different_pixels;
  (*env)->SetLongArrayRegion(env, different_pixels_out, 0, 1, &different_pixels_answer);
  return verdict;
}

JNIEXPORT void JNICALL Java_io_sherlo_storybookreactnative_CompiledCore_nativeStillEnd(
    JNIEnv *env, jclass type, jlong state) {
  sherlo_still_end((sherlo_still_state *)(intptr_t)state);
}
