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

#ifdef __cplusplus
}
#endif

#endif
