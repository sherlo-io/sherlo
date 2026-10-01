// Sherlo native core - readable source. It ships only compiled and stripped (an xcframework on
// iOS, one .so per ABI on Android). In the real build this lives in a private repository.
#include "sherlo_core.h"

#ifndef SHERLO_CORE_VERSION
#define SHERLO_CORE_VERSION "0.0.0"
#endif

// Internal helpers are static: they never reach the symbol table a reader could list.
static double luma(double r, double g, double b) { return r * 0.29889531 + g * 0.58662247 + b * 0.11448223; }
static double chroma_i(double r, double g, double b) { return r * 0.59597799 - g * 0.27417610 - b * 0.32180189; }
static double chroma_q(double r, double g, double b) { return r * 0.21147017 - g * 0.52261711 + b * 0.31114694; }

// Perceived colour distance between two pixels (YIQ), blended onto white by alpha.
static double colour_delta(const uint8_t *a, const uint8_t *b) {
  double alpha_a = a[3] / 255.0, alpha_b = b[3] / 255.0;
  double ra = 255 + (a[0] - 255) * alpha_a, ga = 255 + (a[1] - 255) * alpha_a, ba = 255 + (a[2] - 255) * alpha_a;
  double rb = 255 + (b[0] - 255) * alpha_b, gb = 255 + (b[1] - 255) * alpha_b, bb = 255 + (b[2] - 255) * alpha_b;
  double y = luma(ra, ga, ba) - luma(rb, gb, bb);
  double i = chroma_i(ra, ga, ba) - chroma_i(rb, gb, bb);
  double q = chroma_q(ra, ga, ba) - chroma_q(rb, gb, bb);
  return 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q;
}

const char *sherlo_core_version(void) { return SHERLO_CORE_VERSION; }

int sherlo_core_abi(void) { return SHERLO_CORE_ABI; }

int sherlo_core_count_different_pixels(const uint8_t *rgba_a, const uint8_t *rgba_b, int width,
                                       int height, double threshold) {
  const double max_delta = 35215.0 * threshold * threshold;
  int different = 0;
  for (int index = 0; index < width * height; index++) {
    if (colour_delta(rgba_a + index * 4, rgba_b + index * 4) > max_delta) different++;
  }
  return different;
}
