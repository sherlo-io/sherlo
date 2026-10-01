// Sherlo native core - the one public header. Plain C, no React Native, no JSI: the SDK's open
// native glue (ObjC on iOS, JNI on Android) calls these, and everything behind them ships compiled.
#ifndef SHERLO_CORE_H
#define SHERLO_CORE_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define SHERLO_CORE_ABI 1

/** The core's version, e.g. "2.0.2". */
const char *sherlo_core_version(void);

/** The C ABI this build speaks; the glue refuses a core whose ABI it does not know. */
int sherlo_core_abi(void);

/**
 * How many pixels differ between two RGBA images of the same size, counting a pixel as different
 * when its perceived colour distance is above `threshold` (0..1). The stand-in for the stillness
 * comparison the SDK makes between two screenshots.
 */
int sherlo_core_count_different_pixels(const uint8_t *rgba_a, const uint8_t *rgba_b, int width,
                                       int height, double threshold);

#ifdef __cplusplus
}
#endif

#endif
