// The C core's JNI face on Android: the calls io.sherlo.storybookreactnative.CompiledCore declares
// `native`. Compiled into the same stripped libsherlocore.so as the core, whose own names stay
// hidden: only these entry points are exported.
//
// Screenshots arrive as android.graphics.Bitmap and are read in place through libjnigraphics, so
// no compare copies a pixel.
#include <android/bitmap.h>
#include <jni.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

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

// ---- Scrolling -----------------------------------------------------------------------------------

// A view's scroll numbers as Android's glue reads them: no insets, and an extent only when the
// checkpoint reads one.
static sherlo_scroll_metrics android_metrics(jboolean can_scroll, jboolean is_shown, jint height,
                                             jint range, jint extent) {
  sherlo_scroll_metrics metrics;
  metrics.can_scroll = can_scroll ? 1 : 0;
  metrics.is_shown = is_shown ? 1 : 0;
  metrics.viewport_height = height;
  metrics.content_height = range;
  metrics.inset_top = 0;
  metrics.inset_bottom = 0;
  metrics.scroll_extent = extent;
  return metrics;
}

// A view the scroll-view walk reached, which can scroll vertically: its class name and whether it
// is VISIBLE, and the numbers the glue reads only once it is eligible (0 and -1 before that).
static sherlo_scroll_candidate android_candidate(const char *class_name, jboolean is_shown,
                                                 jint height, jint range, jboolean is_on_screen,
                                                 jint visible_width, jint visible_height) {
  sherlo_scroll_candidate candidate;
  candidate.class_name = class_name;
  candidate.is_hidden = 0;
  candidate.alpha = 1;
  candidate.metrics = android_metrics(JNI_TRUE, is_shown, height, range, -1);
  candidate.is_on_screen = is_on_screen ? 1 : 0;
  candidate.visible_width = visible_width;
  candidate.visible_height = visible_height;
  return candidate;
}

JNIEXPORT jboolean JNICALL
Java_io_sherlo_storybookreactnative_CompiledCore_nativeScrollCandidateIsEligible(
    JNIEnv *env, jclass type, jstring class_name, jboolean is_shown) {
  const char *name = (*env)->GetStringUTFChars(env, class_name, NULL);
  if (name == NULL) return JNI_FALSE;
  sherlo_scroll_candidate candidate = android_candidate(name, is_shown, 0, -1, JNI_FALSE, 0, 0);
  jboolean eligible =
      sherlo_scroll_candidate_is_eligible(SHERLO_PLATFORM_ANDROID, &candidate) == 1;
  (*env)->ReleaseStringUTFChars(env, class_name, name);
  return eligible;
}

JNIEXPORT jboolean JNICALL Java_io_sherlo_storybookreactnative_CompiledCore_nativeScrollCandidateFits(
    JNIEnv *env, jclass type, jstring class_name, jboolean is_shown, jint height, jint range,
    jboolean is_on_screen, jint visible_width, jint visible_height, jint screen_width,
    jint screen_height) {
  const char *name = (*env)->GetStringUTFChars(env, class_name, NULL);
  if (name == NULL) return JNI_FALSE;
  sherlo_scroll_candidate candidate = android_candidate(name, is_shown, height, range, is_on_screen,
                                                        visible_width, visible_height);
  jboolean fits = sherlo_scroll_candidate_fits(SHERLO_PLATFORM_ANDROID, &candidate, screen_width,
                                               screen_height) == 1;
  (*env)->ReleaseStringUTFChars(env, class_name, name);
  return fits;
}

JNIEXPORT jboolean JNICALL Java_io_sherlo_storybookreactnative_CompiledCore_nativeScrollIsScrollable(
    JNIEnv *env, jclass type, jboolean can_scroll, jboolean is_shown, jint height, jint range) {
  sherlo_scroll_metrics metrics = android_metrics(can_scroll, is_shown, height, range, -1);
  return sherlo_scroll_is_scrollable(SHERLO_PLATFORM_ANDROID, &metrics) == 1;
}

JNIEXPORT jboolean JNICALL Java_io_sherlo_storybookreactnative_CompiledCore_nativeScrollNudgeTarget(
    JNIEnv *env, jclass type, jint attempt, jint offset, jint scroll_y, jintArray distance_out) {
  // Android's nudge scrolls down, then up, whatever the view's numbers: it does not read them.
  sherlo_scroll_metrics metrics = android_metrics(JNI_TRUE, JNI_TRUE, 0, -1, -1);
  sherlo_scroll_position before;
  before.offset = offset;
  before.scroll_y = scroll_y;
  double distance = 0;
  if (sherlo_scroll_nudge_target(SHERLO_PLATFORM_ANDROID, attempt, &metrics, &before, &distance) != 1) {
    return JNI_FALSE;
  }
  jint distance_answer = (jint)distance;
  (*env)->SetIntArrayRegion(env, distance_out, 0, 1, &distance_answer);
  return JNI_TRUE;
}

JNIEXPORT jboolean JNICALL Java_io_sherlo_storybookreactnative_CompiledCore_nativeScrollNudgeMoved(
    JNIEnv *env, jclass type, jint offset_before, jint scroll_y_before, jint offset_after,
    jint scroll_y_after) {
  sherlo_scroll_position before;
  before.offset = offset_before;
  before.scroll_y = scroll_y_before;
  sherlo_scroll_position after;
  after.offset = offset_after;
  after.scroll_y = scroll_y_after;
  return sherlo_scroll_nudge_moved(SHERLO_PLATFORM_ANDROID, &before, &after) == 1;
}

// The plan holds plain numbers only, so the read-back plans again from the same numbers rather
// than keep a plan between the two calls.
static int32_t android_checkpoint_plan(jint index, jint step_px, jint last_index, jint height,
                                       jint range, jint extent, sherlo_checkpoint_plan *plan) {
  sherlo_scroll_metrics metrics = android_metrics(JNI_TRUE, JNI_TRUE, height, range, extent);
  return sherlo_checkpoint_plan_for(SHERLO_PLATFORM_ANDROID, index, step_px, last_index, &metrics,
                                    1, plan);
}

JNIEXPORT jint JNICALL Java_io_sherlo_storybookreactnative_CompiledCore_nativeCheckpointTarget(
    JNIEnv *env, jclass type, jint index, jint step_px, jint last_index, jint height, jint range,
    jint extent) {
  sherlo_checkpoint_plan plan;
  android_checkpoint_plan(index, step_px, last_index, height, range, extent, &plan);
  return (jint)plan.target_offset;
}

JNIEXPORT void JNICALL Java_io_sherlo_storybookreactnative_CompiledCore_nativeCheckpointReadBack(
    JNIEnv *env, jclass type, jint index, jint step_px, jint last_index, jint height, jint range,
    jint extent, jint actual_offset, jintArray result_out) {
  sherlo_checkpoint_plan plan;
  android_checkpoint_plan(index, step_px, last_index, height, range, extent, &plan);
  sherlo_checkpoint_result result;
  sherlo_checkpoint_read_back(&plan, actual_offset, &result);
  // reachedBottom, appliedIndex, appliedOffsetPx, viewportPx, contentPx
  jint answer[5] = {result.reached_bottom, (jint)result.applied_index,
                    (jint)result.applied_offset_px, (jint)result.viewport_px,
                    (jint)result.content_px};
  (*env)->SetIntArrayRegion(env, result_out, 0, 5, answer);
}

// ---- The inspector -------------------------------------------------------------------------------

JNIEXPORT jboolean JNICALL Java_io_sherlo_storybookreactnative_CompiledCore_nativeInspectorHasRoom(
    JNIEnv *env, jclass type, jint depth, jint nodes_kept) {
  return sherlo_inspector_has_room(depth, nodes_kept) == 1;
}

JNIEXPORT jboolean JNICALL Java_io_sherlo_storybookreactnative_CompiledCore_nativeInspectorIsOnScreen(
    JNIEnv *env, jclass type, jint top, jint bottom, jint viewport_top, jint viewport_bottom) {
  return sherlo_inspector_is_on_screen(top, bottom, viewport_top, viewport_bottom) == 1;
}

// The numbers CompiledCore.java packs for each inspector node, in this order.
enum node_number {
  NODE_DEPTH,
  NODE_CLASS_INDEX,
  NODE_IS_VISIBLE,
  NODE_X,
  NODE_Y,
  NODE_WIDTH,
  NODE_HEIGHT,
  NODE_HAS_ID,
  NODE_ID,
  NODE_TOP,
  NODE_BOTTOM,
  NUMBERS_PER_NODE,
};

// A copy of a string the caller frees, or NULL when out of memory.
static char *copy_of(const char *text) {
  size_t size = strlen(text) + 1;
  char *copy = malloc(size);
  if (copy != NULL) memcpy(copy, text, size);
  return copy;
}

JNIEXPORT jstring JNICALL Java_io_sherlo_storybookreactnative_CompiledCore_nativeInspectorJson(
    JNIEnv *env, jclass type, jintArray node_numbers, jint node_count, jobjectArray class_names,
    jfloat density, jfloat font_scale, jint viewport_top, jint viewport_bottom) {
  if (node_count < 0 || (*env)->GetArrayLength(env, node_numbers) < node_count * NUMBERS_PER_NODE) {
    return NULL;
  }
  jsize class_count = (*env)->GetArrayLength(env, class_names);
  sherlo_inspector_node *nodes = calloc(node_count > 0 ? (size_t)node_count : 1, sizeof(*nodes));
  char **names = calloc(class_count > 0 ? (size_t)class_count : 1, sizeof(char *));
  jint *numbers = NULL;
  int64_t length = 0;
  char *json = NULL;
  jstring json_string = NULL;
  if (nodes == NULL || names == NULL) goto answer;
  numbers = (*env)->GetIntArrayElements(env, node_numbers, NULL);
  if (numbers == NULL) goto answer;

  for (jint index = 0; index < node_count; index++) {
    const jint *node_number = numbers + index * NUMBERS_PER_NODE;
    sherlo_inspector_node *node = &nodes[index];
    node->depth = node_number[NODE_DEPTH];
    node->class_index = node_number[NODE_CLASS_INDEX];
    node->is_visible = node_number[NODE_IS_VISIBLE] ? 1 : 0;
    node->x = node_number[NODE_X];
    node->y = node_number[NODE_Y];
    node->width = node_number[NODE_WIDTH];
    node->height = node_number[NODE_HEIGHT];
    node->has_id = node_number[NODE_HAS_ID] ? 1 : 0;
    node->id = node_number[NODE_ID];
    node->top = node_number[NODE_TOP];
    node->bottom = node_number[NODE_BOTTOM];
  }
  (*env)->ReleaseIntArrayElements(env, node_numbers, numbers, JNI_ABORT);

  // Each class name is copied, its characters released and its local reference deleted at once,
  // so a screen of many classes never holds more than one reference. Java's strings arrive as
  // modified UTF-8, and the JSON goes back the same way.
  for (jsize index = 0; index < class_count; index++) {
    jstring class_name = (jstring)(*env)->GetObjectArrayElement(env, class_names, index);
    if (class_name == NULL) goto answer;
    const char *characters = (*env)->GetStringUTFChars(env, class_name, NULL);
    if (characters != NULL) {
      names[index] = copy_of(characters);
      (*env)->ReleaseStringUTFChars(env, class_name, characters);
    }
    (*env)->DeleteLocalRef(env, class_name);
    if (names[index] == NULL) goto answer;
  }

  // The floats are widened to doubles, as org.json widened them.
  json = sherlo_inspector_json(SHERLO_PLATFORM_ANDROID, nodes, node_count,
                               (const char *const *)names, class_count, (double)density,
                               (double)font_scale, viewport_top, viewport_bottom, &length);
  if (json != NULL) json_string = (*env)->NewStringUTF(env, json);

answer:
  // Every way out comes here: what was handed out is freed, and a refusal answers null.
  sherlo_free(json);
  if (names != NULL) {
    for (jsize index = 0; index < class_count; index++) free(names[index]);
  }
  free(names);
  free(nodes);
  return json_string;
}
