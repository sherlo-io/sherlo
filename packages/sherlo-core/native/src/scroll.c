// The scroll engine of a long screenshot: which view it scrolls, whether that view scrolls, the
// nudge that settles a doubt, and where each checkpoint scrolls to.
//
// The rules are the ones the SDK ran before this core: ios/SherloModuleCore.m (findBestScrollViewBFS,
// isScrollableByMetrics, validateWithNudge, performScrollToCheckpoint) and Android's
// SherloModuleCore.java (the same names). The two platforms never agreed, and still do not: each
// function below keeps a platform's own numbers, and its own arithmetic - CGFloat on iOS, Java's
// int and float on Android.
#include <math.h>
#include <stddef.h>
#include <string.h>

#include "sherlo_core.h"

// ---- Each platform's constants -------------------------------------------------------------------

// A scroll view smaller than this share of the screen is a toast or a badge, not the screen.
#define IOS_SMALLEST_SHARE_OF_SCREEN 0.10
#define ANDROID_SCREEN_SHARE_DIVISOR 10

// How far a view must scroll past its viewport to count as scrollable. iOS picked with a margin of
// 1 point and checked the pick again with 4; Android used 4 pixels for both.
#define IOS_PICK_MARGIN_PT 1.0
#define IOS_CHECK_MARGIN_PT 4.0
#define ANDROID_MARGIN_PX 4.0f

// A nudge moves the view by 3 and puts it back. It moved when it moved by at least 1.
#define NUDGE_DISTANCE 3.0
#define NUDGE_SMALLEST_MOVE 1.0

// A checkpoint is at the bottom when it is this close to the last offset: 2 pixels on iOS
// (counted in points), 4 pixels on Android.
#define IOS_BOTTOM_MARGIN_PX 2.0
#define ANDROID_BOTTOM_MARGIN_PX 4.0f

// The class names of the framework's own scroll views, which are never the screen.
#define IOS_FRAMEWORK_CLASS_PREFIX "_"
#define ANDROID_FRAMEWORK_CLASS_PREFIX "com.android.internal."

// ---- Each platform's arithmetic ------------------------------------------------------------------

// Java's int: arithmetic that wraps on overflow instead of being undefined.
static int32_t java_int(int64_t value) { return (int32_t)(uint32_t)(uint64_t)value; }

// Java's Math.abs on an int, where the smallest int stays negative.
static int32_t java_abs(int32_t value) { return value < 0 ? java_int(-(int64_t)value) : value; }

// Foundation's MAX and MIN, as iOS compiled them: `a < b ? b : a` and `a < b ? a : b`, so a NaN
// answers the first number to MAX and the second to MIN.
static double objc_max(double a, double b) { return a < b ? b : a; }
static double objc_min(double a, double b) { return a < b ? a : b; }

static int is_known_platform(int32_t platform) {
  return platform == SHERLO_PLATFORM_IOS || platform == SHERLO_PLATFORM_ANDROID;
}

// ---- Is it scrollable by its numbers? ------------------------------------------------------------

// iOS's isScrollableByMetrics:epsilon:, in points.
static int ios_is_scrollable(const sherlo_scroll_metrics *metrics, double margin_pt) {
  if (!metrics->can_scroll) return 0;
  double scroll_range = metrics->content_height + (metrics->inset_top + metrics->inset_bottom) -
                        metrics->viewport_height;
  if (metrics->viewport_height <= 0) return 0;
  if (scroll_range <= margin_pt) return 0;
  if (!metrics->is_shown) return 0;
  return 1;
}

// Android's isScrollableByMetrics, in pixels. A range that could not be read leaves only the
// platform's own word that the view can scroll.
static int android_is_scrollable(const sherlo_scroll_metrics *metrics) {
  if (!metrics->can_scroll) return 0;
  if (!metrics->is_shown) return 0;
  int32_t extent = (int32_t)metrics->viewport_height;
  int32_t range = (int32_t)metrics->content_height;
  if (range <= 0) return 1;
  int32_t scroll_range = java_int((int64_t)range - extent);
  if (extent <= 0) return 0;
  if ((float)scroll_range <= ANDROID_MARGIN_PX) return 0;
  return 1;
}

int32_t sherlo_scroll_is_scrollable(int32_t platform, const sherlo_scroll_metrics *metrics) {
  if (metrics == NULL || !is_known_platform(platform)) return SHERLO_ERROR_BAD_ARGUMENT;
  if (platform == SHERLO_PLATFORM_IOS) return ios_is_scrollable(metrics, IOS_CHECK_MARGIN_PT);
  return android_is_scrollable(metrics);
}

// ---- The pick ------------------------------------------------------------------------------------

static int starts_with(const char *text, const char *prefix) {
  return text != NULL && strncmp(text, prefix, strlen(prefix)) == 0;
}

// iOS's findBestScrollViewBFS, for one UIScrollView: shown, enabled, in a window, and not one of
// the framework's own.
static int ios_is_eligible(const sherlo_scroll_candidate *candidate) {
  const sherlo_scroll_metrics *metrics = &candidate->metrics;
  if (candidate->is_hidden || candidate->alpha < 0.01 || !metrics->can_scroll || !metrics->is_shown) {
    return 0;
  }
  return !starts_with(candidate->class_name, IOS_FRAMEWORK_CLASS_PREFIX);
}

// Android's findBestScrollViewBFS, for one view: it can scroll vertically, is VISIBLE, and is not
// one of the framework's own.
static int android_is_eligible(const sherlo_scroll_candidate *candidate) {
  if (!candidate->metrics.can_scroll) return 0;
  if (!candidate->metrics.is_shown) return 0;
  return !starts_with(candidate->class_name, ANDROID_FRAMEWORK_CLASS_PREFIX);
}

static int ios_fits(const sherlo_scroll_candidate *candidate, double screen_width,
                    double screen_height) {
  if (!ios_is_eligible(candidate)) return 0;
  if (!ios_is_scrollable(&candidate->metrics, IOS_PICK_MARGIN_PT)) return 0;
  double smallest_area = screen_width * screen_height * IOS_SMALLEST_SHARE_OF_SCREEN;
  // A frame that does not meet the window covers nothing.
  double area = candidate->is_on_screen ? candidate->visible_width * candidate->visible_height : 0;
  return !(area < smallest_area);
}

static int android_fits(const sherlo_scroll_candidate *candidate, double screen_width,
                        double screen_height) {
  if (!android_is_eligible(candidate)) return 0;
  if (!android_is_scrollable(&candidate->metrics)) return 0;
  // A view getGlobalVisibleRect finds nothing of is never picked.
  if (!candidate->is_on_screen) return 0;
  int32_t screen_area = java_int((int64_t)(int32_t)screen_width * (int32_t)screen_height);
  int32_t smallest_area = screen_area / ANDROID_SCREEN_SHARE_DIVISOR;
  int32_t area = java_int((int64_t)(int32_t)candidate->visible_width *
                          (int32_t)candidate->visible_height);
  return !(area < smallest_area);
}

int32_t sherlo_scroll_candidate_is_eligible(int32_t platform,
                                            const sherlo_scroll_candidate *candidate) {
  if (!is_known_platform(platform) || candidate == NULL) return SHERLO_ERROR_BAD_ARGUMENT;
  return platform == SHERLO_PLATFORM_IOS ? ios_is_eligible(candidate)
                                         : android_is_eligible(candidate);
}

int32_t sherlo_scroll_candidate_fits(int32_t platform, const sherlo_scroll_candidate *candidate,
                                     double screen_width, double screen_height) {
  if (!is_known_platform(platform) || candidate == NULL) return SHERLO_ERROR_BAD_ARGUMENT;
  return platform == SHERLO_PLATFORM_IOS ? ios_fits(candidate, screen_width, screen_height)
                                         : android_fits(candidate, screen_width, screen_height);
}

// ---- The nudge -----------------------------------------------------------------------------------

// iOS tried one move: 3 points down, or up when down is at the end, kept inside the scroll range.
static int32_t ios_nudge_target(int32_t attempt, const sherlo_scroll_metrics *metrics,
                                const sherlo_scroll_position *before, double *target) {
  if (attempt != 0) return 0;
  double lowest = -metrics->inset_top;
  double highest = metrics->content_height - metrics->viewport_height + metrics->inset_bottom;
  double original = before->offset;

  double offset = objc_max(lowest, objc_min(highest, original + NUDGE_DISTANCE));
  if (fabs(offset - original) < NUDGE_SMALLEST_MOVE) {
    offset = objc_max(lowest, objc_min(highest, original - NUDGE_DISTANCE));
  }
  if (fabs(offset - original) < NUDGE_SMALLEST_MOVE) return 0;
  *target = offset;
  return 1;
}

// Android tried two moves, each put back before the next: 3 pixels down, then 3 up.
static int32_t android_nudge_target(int32_t attempt, double *distance) {
  if (attempt == 0) {
    *distance = NUDGE_DISTANCE;
    return 1;
  }
  if (attempt == 1) {
    *distance = -NUDGE_DISTANCE;
    return 1;
  }
  return 0;
}

int32_t sherlo_scroll_nudge_target(int32_t platform, int32_t attempt,
                                   const sherlo_scroll_metrics *metrics,
                                   const sherlo_scroll_position *before, double *target) {
  if (!is_known_platform(platform) || metrics == NULL || before == NULL || target == NULL ||
      attempt < 0) {
    return SHERLO_ERROR_BAD_ARGUMENT;
  }
  if (platform == SHERLO_PLATFORM_IOS) return ios_nudge_target(attempt, metrics, before, target);
  return android_nudge_target(attempt, target);
}

int32_t sherlo_scroll_nudge_moved(int32_t platform, const sherlo_scroll_position *before,
                                  const sherlo_scroll_position *after) {
  if (!is_known_platform(platform) || before == NULL || after == NULL) {
    return SHERLO_ERROR_BAD_ARGUMENT;
  }
  if (platform == SHERLO_PLATFORM_IOS) {
    return fabs(after->offset - before->offset) >= NUDGE_SMALLEST_MOVE;
  }
  // Android looked at both: a RecyclerView moves its offset and keeps its scrollY at 0.
  int32_t offset_moved = java_abs(java_int((int64_t)after->offset - (int64_t)before->offset));
  int32_t scroll_y_moved = java_abs(java_int((int64_t)after->scroll_y - (int64_t)before->scroll_y));
  return offset_moved >= 1 || scroll_y_moved >= 1;
}

// ---- The checkpoints -----------------------------------------------------------------------------

static int64_t kept_between(int64_t index, int64_t last_index) {
  if (index < 0) index = 0;
  if (index > last_index) index = last_index;
  return index;
}

// iOS, in points: the offsets run from minus the top inset to the end of the content.
static void ios_plan(int64_t index, double step_px, int64_t last_index,
                     const sherlo_scroll_metrics *metrics, double pixels_per_point,
                     sherlo_checkpoint_plan *plan) {
  double lowest = -metrics->inset_top;
  double scroll_range = objc_max(0, metrics->content_height + metrics->inset_bottom +
                                        metrics->inset_top - metrics->viewport_height);
  double highest = lowest + scroll_range;
  double step_pt = step_px / pixels_per_point;

  int64_t applied_index = kept_between(index, last_index);
  double target = applied_index == 0 ? lowest : lowest + ((double)applied_index * step_pt);

  plan->applied_index = applied_index;
  plan->target_offset = objc_max(lowest, objc_min(highest, target));
  plan->lowest_offset = lowest;
  plan->highest_offset = highest;
  plan->scroll_range = scroll_range;
  plan->pixels_per_point = pixels_per_point;
  plan->viewport_px = metrics->viewport_height * pixels_per_point;
  plan->content_px = metrics->content_height * pixels_per_point;
}

// Android, in Java ints: the offsets run from 0 to the range less the extent, where an extent that
// could not be read is the view's height.
static void android_plan(int64_t index, double step_px, int64_t last_index,
                         const sherlo_scroll_metrics *metrics, sherlo_checkpoint_plan *plan) {
  int32_t viewport = (int32_t)metrics->viewport_height;
  int32_t range = (int32_t)metrics->content_height;
  int32_t extent = (int32_t)metrics->scroll_extent;
  if (extent <= 0) extent = viewport;
  int32_t highest = java_int((int64_t)range - extent);
  if (highest < 0) highest = 0;

  int32_t applied_index = (int32_t)kept_between((int32_t)index, (int32_t)last_index);
  int32_t target = applied_index == 0 ? 0 : java_int((int64_t)applied_index * (int32_t)step_px);
  if (target > highest) target = highest;
  if (target < 0) target = 0;

  plan->applied_index = applied_index;
  plan->target_offset = target;
  plan->lowest_offset = 0;
  plan->highest_offset = highest;
  plan->scroll_range = highest;
  plan->pixels_per_point = 1;
  plan->viewport_px = viewport;
  plan->content_px = range;
}

int32_t sherlo_checkpoint_plan_for(int32_t platform, int64_t index, double step_px,
                                   int64_t last_index, const sherlo_scroll_metrics *metrics,
                                   double pixels_per_point, sherlo_checkpoint_plan *plan) {
  if (!is_known_platform(platform) || metrics == NULL || plan == NULL) {
    return SHERLO_ERROR_BAD_ARGUMENT;
  }
  memset(plan, 0, sizeof(*plan));
  plan->platform = platform;
  if (platform == SHERLO_PLATFORM_IOS) {
    ios_plan(index, step_px, last_index, metrics, pixels_per_point, plan);
  } else {
    android_plan(index, step_px, last_index, metrics, plan);
  }
  return 0;
}

int32_t sherlo_checkpoint_read_back(const sherlo_checkpoint_plan *plan, double actual_offset,
                                    sherlo_checkpoint_result *result) {
  if (plan == NULL || result == NULL || !is_known_platform(plan->platform)) {
    return SHERLO_ERROR_BAD_ARGUMENT;
  }
  result->applied_index = plan->applied_index;
  result->viewport_px = plan->viewport_px;
  result->content_px = plan->content_px;

  if (plan->platform == SHERLO_PLATFORM_IOS) {
    // iOS reports the distance scrolled from the top, in pixels.
    result->applied_offset_px = (actual_offset - plan->lowest_offset) * plan->pixels_per_point;
    double margin_pt = IOS_BOTTOM_MARGIN_PX / plan->pixels_per_point;
    result->reached_bottom = actual_offset >= plan->highest_offset - margin_pt ||
                             plan->scroll_range <= margin_pt;
  } else {
    // Android reports the offset it read back, in pixels, and compares in Java's float.
    int32_t actual = (int32_t)actual_offset;
    int32_t highest = (int32_t)plan->highest_offset;
    result->applied_offset_px = actual;
    result->reached_bottom = (float)actual >= (float)highest - ANDROID_BOTTOM_MARGIN_PX ||
                             (float)highest <= ANDROID_BOTTOM_MARGIN_PX;
  }
  return 0;
}
