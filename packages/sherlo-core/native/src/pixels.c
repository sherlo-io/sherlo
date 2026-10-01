// The pixel compare: how many pixels of two screenshots differ.
//
// Based on https://github.com/mapbox/pixelmatch v7.1.0 (ISC license, Copyright (c) 2025, Mapbox),
// as the SDK's iOS Pixelmatch.m and Android Pixelmatch.java ported it before this core replaced
// them. The two ports were the same algorithm, and so is this one, step for step: the colour
// distance in YIQ space, and the anti-aliasing test that can leave a pixel out.
#include <math.h>
#include <stddef.h>

#include "sherlo_core.h"

// ---- Reading a pixel -----------------------------------------------------------------------------

// One colour channel without its premultiplication, rounded, at most 255 - as the iOS port
// converted its premultiplied bitmap, and as Android's Bitmap.getPixels hands colours back.
static uint8_t unpremultiply(uint8_t channel, uint8_t alpha) {
  long straight = lround((double)channel * 255.0 / alpha);
  return straight > 255 ? 255 : (uint8_t)straight;
}

// The pixel at (x, y), un-premultiplied and packed as 0xAARRGGBB: the value both ports compared.
static uint32_t straight_argb_at(const sherlo_image *image, int32_t x, int32_t y) {
  const uint8_t *pixel = image->pixels + (size_t)y * (size_t)image->stride_bytes + (size_t)x * 4;
  uint8_t red = pixel[0];
  uint8_t green = pixel[1];
  uint8_t blue = pixel[2];
  uint8_t alpha = pixel[3];
  if (alpha != 0 && alpha != 255) {
    red = unpremultiply(red, alpha);
    green = unpremultiply(green, alpha);
    blue = unpremultiply(blue, alpha);
  }
  return ((uint32_t)alpha << 24) | ((uint32_t)red << 16) | ((uint32_t)green << 8) | (uint32_t)blue;
}

static uint8_t alpha_of(uint32_t argb) { return (uint8_t)(argb >> 24); }
static uint8_t red_of(uint32_t argb) { return (uint8_t)(argb >> 16); }
static uint8_t green_of(uint32_t argb) { return (uint8_t)(argb >> 8); }
static uint8_t blue_of(uint32_t argb) { return (uint8_t)argb; }

// ---- The colour distance -------------------------------------------------------------------------

// How differently two pixels look, in YIQ space. With `luma_only`, only the brightness difference
// (signed). Otherwise the full distance, negative when the first pixel is the brighter.
// `pixel_index` places the background a semi-transparent pixel is blended onto.
static double colour_delta(uint32_t first, uint32_t second, int luma_only, int64_t pixel_index) {
  if (first == second) return 0.0;

  double red_difference = (double)red_of(first) - red_of(second);
  double green_difference = (double)green_of(first) - green_of(second);
  double blue_difference = (double)blue_of(first) - blue_of(second);
  double alpha_difference = (double)alpha_of(first) - alpha_of(second);

  if (alpha_of(first) < 255 || alpha_of(second) < 255) {
    // Composite both pixels onto a background that changes with the pixel's position.
    int64_t byte_offset = pixel_index * 4;
    double background_red = 48.0 + 159.0 * (double)(byte_offset % 2);
    double background_green =
        48.0 + 159.0 * (double)((int64_t)floor((double)byte_offset / 1.618033988749895) % 2);
    double background_blue =
        48.0 + 159.0 * (double)((int64_t)floor((double)byte_offset / 2.618033988749895) % 2);
    red_difference = ((double)red_of(first) * alpha_of(first) -
                      (double)red_of(second) * alpha_of(second) - background_red * alpha_difference) /
                     255.0;
    green_difference = ((double)green_of(first) * alpha_of(first) -
                        (double)green_of(second) * alpha_of(second) -
                        background_green * alpha_difference) /
                       255.0;
    blue_difference = ((double)blue_of(first) * alpha_of(first) -
                       (double)blue_of(second) * alpha_of(second) -
                       background_blue * alpha_difference) /
                      255.0;
  }

  double luma = red_difference * 0.29889531 + green_difference * 0.58662247 +
                blue_difference * 0.11448223;
  if (luma_only) return luma;

  double in_phase = red_difference * 0.59597799 - green_difference * 0.27417610 -
                    blue_difference * 0.32180189;
  double quadrature = red_difference * 0.21147017 - green_difference * 0.52261711 +
                      blue_difference * 0.31114694;
  double distance = 0.5053 * luma * luma + 0.2990 * in_phase * in_phase +
                    0.1957 * quadrature * quadrature;
  return luma > 0 ? -distance : distance;
}

// ---- The anti-aliasing test ----------------------------------------------------------------------

// The 3x3 neighbourhood of (x, y), cut at the image's edges.
typedef struct neighbourhood {
  int32_t first_x, last_x, first_y, last_y;
  // 1 when (x, y) is on the image's edge: one neighbour is missing, and counts as identical.
  int on_edge;
} neighbourhood;

static neighbourhood neighbourhood_of(const sherlo_image *image, int32_t x, int32_t y) {
  neighbourhood around;
  around.first_x = x > 0 ? x - 1 : x;
  around.first_y = y > 0 ? y - 1 : y;
  around.last_x = x < image->width - 1 ? x + 1 : x;
  around.last_y = y < image->height - 1 ? y + 1 : y;
  around.on_edge =
      x == around.first_x || x == around.last_x || y == around.first_y || y == around.last_y;
  return around;
}

// Whether more than two neighbours of (x, y) have exactly its colour: the pixel sits in a flat area.
static int has_many_siblings(const sherlo_image *image, int32_t x, int32_t y) {
  uint32_t centre = straight_argb_at(image, x, y);
  neighbourhood around = neighbourhood_of(image, x, y);
  int identical = around.on_edge ? 1 : 0;
  for (int32_t neighbour_y = around.first_y; neighbour_y <= around.last_y; neighbour_y++) {
    for (int32_t neighbour_x = around.first_x; neighbour_x <= around.last_x; neighbour_x++) {
      if (neighbour_x == x && neighbour_y == y) continue;
      if (straight_argb_at(image, neighbour_x, neighbour_y) == centre && ++identical > 2) return 1;
    }
  }
  return 0;
}

// Whether the pixel at (x, y) of `image` looks like an anti-aliased edge: its darkest and brightest
// neighbours differ from it, and one of them sits in a flat area in both images.
static int is_anti_aliased(const sherlo_image *image, const sherlo_image *other, int32_t x,
                           int32_t y) {
  int64_t pixel_index = (int64_t)y * image->width + x;
  uint32_t centre = straight_argb_at(image, x, y);
  neighbourhood around = neighbourhood_of(image, x, y);
  int identical = around.on_edge ? 1 : 0;

  double darkest_luma = 0.0, brightest_luma = 0.0;
  int32_t darkest_x = x, darkest_y = y;
  int32_t brightest_x = x, brightest_y = y;

  for (int32_t neighbour_y = around.first_y; neighbour_y <= around.last_y; neighbour_y++) {
    for (int32_t neighbour_x = around.first_x; neighbour_x <= around.last_x; neighbour_x++) {
      if (neighbour_x == x && neighbour_y == y) continue;
      double luma = colour_delta(centre, straight_argb_at(image, neighbour_x, neighbour_y), 1,
                                 pixel_index);
      if (luma == 0.0) {
        if (++identical > 2) return 0;
      } else if (luma < darkest_luma) {
        darkest_luma = luma;
        darkest_x = neighbour_x;
        darkest_y = neighbour_y;
      } else if (luma > brightest_luma) {
        brightest_luma = luma;
        brightest_x = neighbour_x;
        brightest_y = neighbour_y;
      }
    }
  }

  if (darkest_luma == 0.0 || brightest_luma == 0.0) return 0;

  if (has_many_siblings(image, darkest_x, darkest_y) &&
      has_many_siblings(other, darkest_x, darkest_y)) {
    return 1;
  }
  if (has_many_siblings(image, brightest_x, brightest_y) &&
      has_many_siblings(other, brightest_x, brightest_y)) {
    return 1;
  }
  return 0;
}

// ---- The count -----------------------------------------------------------------------------------

static int is_readable(const sherlo_image *image) {
  return image != NULL && image->pixels != NULL && image->width > 0 && image->height > 0 &&
         image->format == SHERLO_PIXELS_RGBA8_PREMULTIPLIED &&
         (int64_t)image->stride_bytes >= (int64_t)image->width * 4;
}

int64_t sherlo_count_different_pixels(const sherlo_image *a, const sherlo_image *b, double threshold,
                                      int32_t include_aa) {
  if (!is_readable(a) || !is_readable(b)) return SHERLO_ERROR_BAD_ARGUMENT;
  if (a->width != b->width || a->height != b->height) return SHERLO_ERROR_SIZE_MISMATCH;

  const double max_distance = 35215.0 * threshold * threshold;
  int64_t different = 0;
  for (int32_t y = 0; y < a->height; y++) {
    for (int32_t x = 0; x < a->width; x++) {
      uint32_t pixel_a = straight_argb_at(a, x, y);
      uint32_t pixel_b = straight_argb_at(b, x, y);
      if (pixel_a == pixel_b) continue;

      int64_t pixel_index = (int64_t)y * a->width + x;
      if (fabs(colour_delta(pixel_a, pixel_b, 0, pixel_index)) <= max_distance) continue;

      if (!include_aa && (is_anti_aliased(a, b, x, y) || is_anti_aliased(b, a, x, y))) continue;
      different++;
    }
  }
  return different;
}
