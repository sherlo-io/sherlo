// Sherlo's C core - its one public header. Plain C, with no React Native in it: the SDK's open
// native glue (Objective-C on iOS, JNI on Android) calls these, and everything behind them ships
// compiled and stripped.
//
// Data goes in and comes out. Nothing here calls back into the app: no function takes a function.
#ifndef SHERLO_CORE_H
#define SHERLO_CORE_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// The C ABI this header describes. The glue keeps its own copy of the number it knows, and refuses
// a core that reports another.
#define SHERLO_CORE_ABI 1

// Errors are negative numbers.
#define SHERLO_ERROR_BAD_ARGUMENT -1
#define SHERLO_ERROR_SIZE_MISMATCH -2

/** The core's version, e.g. "2.0.2". */
const char *sherlo_core_version(void);

/** The C ABI this build speaks (SHERLO_CORE_ABI when it was built). */
int32_t sherlo_core_abi(void);

/** Frees memory the core handed out. */
void sherlo_free(void *memory);

// ---- Images --------------------------------------------------------------------------------------

/** Four bytes a pixel, in the order red, green, blue, alpha, with colour premultiplied by alpha. */
#define SHERLO_PIXELS_RGBA8_PREMULTIPLIED 1

/** A screenshot as the platform drew it. The core only reads `pixels`. */
typedef struct sherlo_image {
  const uint8_t *pixels;
  int32_t width;
  int32_t height;
  /** Bytes from the start of one row to the start of the next: at least width * 4. */
  int32_t stride_bytes;
  /** SHERLO_PIXELS_RGBA8_PREMULTIPLIED, the one format there is. */
  int32_t format;
} sherlo_image;

/**
 * How many pixels differ between two screenshots of the same size: the YIQ colour distance of
 * mapbox/pixelmatch 7.1.0, a pixel counting when its distance is above `threshold` (0 to 1,
 * smaller is more sensitive). With `include_aa` 0, a pixel that looks anti-aliased in either
 * screenshot is not counted.
 *
 * Returns the count, SHERLO_ERROR_SIZE_MISMATCH when the sizes differ, or
 * SHERLO_ERROR_BAD_ARGUMENT.
 */
int64_t sherlo_count_different_pixels(const sherlo_image *a, const sherlo_image *b, double threshold,
                                      int32_t include_aa);

// ---- Stillness -----------------------------------------------------------------------------------
//
// The glue takes a screenshot at a fixed interval and hands each new one to sherlo_still_step with
// the one before. The step compares the pair and says whether the screen is still, moving, or not
// decided yet. The glue keeps the timer, the screenshots and the saving.

/** What the run's config asks for, and the one count the two platforms make differently. */
typedef struct sherlo_still_params {
  /** Pairs in a row with no differing pixel that make the screen still. */
  int32_t required_still_pairs;
  /** Screenshots that must be taken before the screen may be called moving. */
  int32_t minimum_screenshots;
  /**
   * Whether the first screenshot, the one taken before the first pair, counts towards
   * minimum_screenshots: 1 on Android, 0 on iOS.
   */
  int32_t counts_first_screenshot;
  /** Time after which a pair that differs makes the screen moving. */
  int64_t time_limit_ms;
  /** Passed to sherlo_count_different_pixels for every pair. */
  double threshold;
  int32_t include_aa;
} sherlo_still_params;

/** One stillness decision under way. Only the core reads inside it. */
typedef struct sherlo_still_state sherlo_still_state;

#define SHERLO_STILL_CONTINUE 0
#define SHERLO_STILL_STABLE 1
#define SHERLO_STILL_UNSTABLE 2

/** Starts a decision, its clock at `now_ms`. NULL on a bad argument or no memory. */
sherlo_still_state *sherlo_still_begin(const sherlo_still_params *params, int64_t now_ms);

/**
 * Compares the newest screenshot with the one before and decides.
 *
 * `focus_was_cleared` is 1 when the glue cleared a focused field since the last step: the count of
 * still pairs and the clock start again.
 *
 * Writes the number of differing pixels to `different_pixels`, or SHERLO_ERROR_SIZE_MISMATCH,
 * which counts as a pair that differs.
 *
 * Returns SHERLO_STILL_CONTINUE, SHERLO_STILL_STABLE, SHERLO_STILL_UNSTABLE, or
 * SHERLO_ERROR_BAD_ARGUMENT (and then nothing is counted).
 */
int32_t sherlo_still_step(sherlo_still_state *state, const sherlo_image *previous,
                          const sherlo_image *current, int64_t now_ms, int32_t focus_was_cleared,
                          int64_t *different_pixels);

/** Ends a decision and frees it. */
void sherlo_still_end(sherlo_still_state *state);

// ---- Platforms -----------------------------------------------------------------------------------
//
// The scroll engine and the inspector take the platform the glue runs on. Each keeps that
// platform's own rules, constants and units: iOS and Android never agreed, and are not meant to.

#define SHERLO_PLATFORM_IOS 1
#define SHERLO_PLATFORM_ANDROID 2

// ---- Scrolling -----------------------------------------------------------------------------------
//
// A long screenshot scrolls one view, checkpoint by checkpoint. The glue finds the views, reads
// their numbers, moves them, and reports their frames; these functions pick the view, check it,
// plan and judge a nudge, and plan and read back each checkpoint.

/** A scroll view's vertical numbers, as the glue read them. */
typedef struct sherlo_scroll_metrics {
  /** iOS: isScrollEnabled. Android: canScrollVertically(1) or canScrollVertically(-1). */
  int32_t can_scroll;
  /** iOS: the view is in a window. Android: getVisibility() is VISIBLE. */
  int32_t is_shown;
  /** iOS: bounds.size.height, in points. Android: getHeight(), in pixels. */
  double viewport_height;
  /**
   * iOS: contentSize.height, in points. Android: computeVerticalScrollRange(), in pixels, or -1
   * when it could not be read.
   */
  double content_height;
  /** iOS: adjustedContentInset.top and .bottom, in points. Android: 0. */
  double inset_top;
  double inset_bottom;
  /**
   * Android: computeVerticalScrollExtent(), in pixels, or -1 when it could not be read. Only
   * sherlo_checkpoint_plan_for reads it. iOS: not read.
   */
  double scroll_extent;
} sherlo_scroll_metrics;

/** One view the long screenshot might scroll. */
typedef struct sherlo_scroll_candidate {
  /** iOS: NSStringFromClass. Android: getClass().getName(). */
  const char *class_name;
  /** iOS: hidden. Android: 0. */
  int32_t is_hidden;
  /** iOS: alpha. Android: 1. */
  double alpha;
  sherlo_scroll_metrics metrics;
  /**
   * Whether any of the view is on screen. iOS: its frame in the window meets the window's bounds.
   * Android: getGlobalVisibleRect answered true.
   */
  int32_t is_on_screen;
  /** The part of the view on screen: iOS in points, Android in pixels. */
  double visible_width;
  double visible_height;
} sherlo_scroll_candidate;

/** sherlo_scroll_pick found no candidate that fits. */
#define SHERLO_SCROLL_NO_CANDIDATE -3

/**
 * Picks the view a long screenshot scrolls: the first candidate that is shown, is not one of the
 * framework's own, can scroll by its numbers, and covers at least a tenth of the screen.
 *
 * The candidates come in the order of a breadth-first walk from the root: on iOS each
 * UIScrollView, on Android each view that can scroll vertically. The glue itself asks
 * sherlo_scroll_candidate_is_eligible and sherlo_scroll_candidate_fits of each candidate as it
 * walks, and stops at the first that fits; this answers the same for a list already read.
 * `screen_width` and `screen_height`: iOS, the window's bounds in points; Android, the root view's
 * size in pixels.
 *
 * Returns the candidate's index, SHERLO_SCROLL_NO_CANDIDATE, or SHERLO_ERROR_BAD_ARGUMENT.
 */
int32_t sherlo_scroll_pick(int32_t platform, const sherlo_scroll_candidate *candidates,
                           int32_t count, double screen_width, double screen_height);

/**
 * The pick's first test, for one candidate, which the glue asks before it reads the candidate's
 * other numbers: is it shown, and not one of the framework's own? Reads only `class_name`,
 * `is_hidden`, `alpha`, `metrics.can_scroll` and `metrics.is_shown`.
 *
 * Returns 1 or 0, or SHERLO_ERROR_BAD_ARGUMENT.
 */
int32_t sherlo_scroll_candidate_is_eligible(int32_t platform,
                                            const sherlo_scroll_candidate *candidate);

/**
 * Whether one candidate, read in full, is the view sherlo_scroll_pick would pick if it came first:
 * the glue asks it of each eligible candidate as its walk reaches it, and stops at the first that
 * fits. `screen_width` and `screen_height` as for sherlo_scroll_pick.
 *
 * Returns 1 or 0, or SHERLO_ERROR_BAD_ARGUMENT.
 */
int32_t sherlo_scroll_candidate_fits(int32_t platform, const sherlo_scroll_candidate *candidate,
                                     double screen_width, double screen_height);

/**
 * Whether the picked view can scroll by its numbers. Returns 1 or 0, or
 * SHERLO_ERROR_BAD_ARGUMENT. A view that cannot is nudged.
 */
int32_t sherlo_scroll_is_scrollable(int32_t platform, const sherlo_scroll_metrics *metrics);

/** Where a view is scrolled to. */
typedef struct sherlo_scroll_position {
  /** iOS: contentOffset.y, in points. Android: computeVerticalScrollOffset(), in pixels. */
  double offset;
  /** Android: getScrollY(), in pixels. iOS: not read. */
  double scroll_y;
} sherlo_scroll_position;

/**
 * A nudge moves the view a little and puts it back, to see whether it scrolls. It is one or more
 * attempts, counted from 0. For each: this call says the move, the glue makes it, reads where the
 * view went and puts it back, and sherlo_scroll_nudge_moved judges it. The first attempt that
 * moved ends the nudge.
 *
 * Writes the attempt's move to `target`: on iOS the content offset to set, in points; on Android
 * the distance to scroll by, in pixels. `before` is where the view was before the nudge.
 *
 * Returns 1 when there is a move to make, 0 when no attempt is left, or
 * SHERLO_ERROR_BAD_ARGUMENT.
 */
int32_t sherlo_scroll_nudge_target(int32_t platform, int32_t attempt,
                                   const sherlo_scroll_metrics *metrics,
                                   const sherlo_scroll_position *before, double *target);

/**
 * Whether the view moved from `before` to `after`, the position the glue read after the move.
 * Returns 1 or 0, or SHERLO_ERROR_BAD_ARGUMENT.
 */
int32_t sherlo_scroll_nudge_moved(int32_t platform, const sherlo_scroll_position *before,
                                  const sherlo_scroll_position *after);

/**
 * Where one checkpoint scrolls to, and what reading it back needs. sherlo_checkpoint_plan_for
 * writes it; the glue reads `target_offset` and `applied_index`, and hands the plan back.
 */
typedef struct sherlo_checkpoint_plan {
  int32_t platform;
  /** The checkpoint asked for, kept between 0 and the last one. */
  int64_t applied_index;
  /**
   * The offset to scroll to. iOS: the content offset to set, in points. Android: the
   * computeVerticalScrollOffset() to reach, in pixels.
   */
  double target_offset;
  /** The offsets the view scrolls between, in the same unit. */
  double lowest_offset;
  double highest_offset;
  /** How far the view scrolls in all, in the same unit. */
  double scroll_range;
  double pixels_per_point;
  double viewport_px;
  double content_px;
} sherlo_checkpoint_plan;

/** What a checkpoint reports, once the glue has scrolled. */
typedef struct sherlo_checkpoint_result {
  int32_t reached_bottom;
  int64_t applied_index;
  /**
   * iOS: the distance scrolled from the top, in pixels. Android: the offset read back, in pixels.
   */
  double applied_offset_px;
  /** iOS: bounds.size.height in pixels. Android: getHeight(). */
  double viewport_px;
  /** iOS: contentSize.height in pixels. Android: computeVerticalScrollRange(), -1 included. */
  double content_px;
} sherlo_checkpoint_result;

/**
 * Plans the scroll to checkpoint `index`, each `step_px` pixels below the one before, where
 * `last_index` is the last checkpoint. `metrics` are the picked view's, read now.
 * `pixels_per_point`: iOS, UIScreen's scale; Android, 1.
 *
 * Returns 0, or SHERLO_ERROR_BAD_ARGUMENT.
 */
int32_t sherlo_checkpoint_plan_for(int32_t platform, int64_t index, double step_px,
                                   int64_t last_index, const sherlo_scroll_metrics *metrics,
                                   double pixels_per_point, sherlo_checkpoint_plan *plan);

/**
 * Reads a checkpoint back: `actual_offset` is where the view is once the glue scrolled it to the
 * plan's target, in the plan's unit. Writes what the checkpoint reports, the bottom included.
 *
 * Returns 0, or SHERLO_ERROR_BAD_ARGUMENT.
 */
int32_t sherlo_checkpoint_read_back(const sherlo_checkpoint_plan *plan, double actual_offset,
                                    sherlo_checkpoint_result *result);

// ---- The inspector -------------------------------------------------------------------------------
//
// getInspectorData answers the views on screen as JSON. The glue walks the views in pre-order -
// a view, then each of its children's subtrees in turn - and keeps one node per view. Before it
// walks into a child it asks sherlo_inspector_has_room and sherlo_inspector_is_on_screen, so it
// never walks a subtree the JSON leaves out. sherlo_inspector_json applies the same two rules again
// and writes the JSON.

/** One view, as the glue read it. */
typedef struct sherlo_inspector_node {
  /** 0 for the root, one more for each level below it. */
  int32_t depth;
  /** The view's class name: an index into the class-name table. */
  int32_t class_index;
  /**
   * iOS: not hidden, alpha above 0.01, and in a window. Android: getGlobalVisibleRect answered
   * true.
   */
  int32_t is_visible;
  /**
   * The frame the JSON reports. iOS: the frame in the window times nativeScale; a number that is
   * not finite is left out. Android: the rect getGlobalVisibleRect filled, in pixels.
   */
  double x;
  double y;
  double width;
  double height;
  /**
   * Whether the view has an id, and the id. iOS: its reactTag, else its tag when above 0.
   * Android: getId() when above 0.
   */
  int32_t has_id;
  int64_t id;
  /**
   * The view's top and bottom edges, as the viewport culling reads them. iOS: its frame in the
   * window, in points. Android: getLocationOnScreen and getHeight(), in pixels. The root's are not
   * read.
   */
  double top;
  double bottom;
} sherlo_inspector_node;

/**
 * Whether the tree has room for one more node at `depth` once `nodes_kept` nodes are kept: no
 * deeper than 50 levels below the root, and no more than 10000 nodes. Returns 1 or 0.
 */
int32_t sherlo_inspector_has_room(int32_t depth, int32_t nodes_kept);

/**
 * Whether a view from `top` to `bottom` meets the viewport, from `viewport_top` to
 * `viewport_bottom`: iOS, the window's height in points; Android, getWindowVisibleDisplayFrame in
 * pixels. Returns 1 or 0.
 */
int32_t sherlo_inspector_is_on_screen(double top, double bottom, double viewport_top,
                                      double viewport_bottom);

/**
 * The JSON getInspectorData answers: the density, the font scale and the view tree, written as
 * each platform's JSON writer wrote it - NSJSONSerialization on iOS, org.json on Android.
 *
 * `nodes` in pre-order, the root first. `class_names`: the class-name table, UTF-8. `density`:
 * iOS nativeScale, Android DisplayMetrics.density. `font_scale`: iOS the body font's size over the
 * system font's, Android Configuration.fontScale. A child the rules above leave out is left out
 * with its subtree.
 *
 * Returns the JSON, UTF-8 and `*length` bytes long, which the caller frees with sherlo_free. Returns
 * NULL on a bad argument (Android: a density or font scale that is not finite, which org.json
 * refused) or when out of memory.
 */
char *sherlo_inspector_json(int32_t platform, const sherlo_inspector_node *nodes, int32_t count,
                            const char *const *class_names, int32_t class_count, double density,
                            double font_scale, double viewport_top, double viewport_bottom,
                            int64_t *length);

#ifdef __cplusplus
}
#endif

#endif
