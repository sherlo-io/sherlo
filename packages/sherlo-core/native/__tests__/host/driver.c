// The host-side driver the C core's suites call: it reads commands on stdin, calls the core, and
// writes one answer line per command on stdout. Compiled with the core for the machine running
// the suite (hostCore.ts).
//
// Commands, as whitespace-separated words:
//   abi
//   version
//   compare <threshold> <include_aa> <image a> <image b>
//   still_begin <required_still_pairs> <minimum_screenshots> <counts_first_screenshot>
//               <time_limit_ms> <threshold> <include_aa> <now_ms>
//   still_step <now_ms> <focus_was_cleared> <image previous> <image current>
//   still_end
// where <image> is: <width> <height> <stride_bytes> <format> <the stride * height bytes, in hex>.
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "sherlo_core.h"

static uint8_t *read_hex_bytes(size_t length) {
  uint8_t *bytes = malloc(length > 0 ? length : 1);
  for (size_t index = 0; index < length; index++) {
    unsigned int byte = 0;
    if (scanf("%2x", &byte) != 1) {
      fprintf(stderr, "driver: image data ended early\n");
      exit(2);
    }
    bytes[index] = (uint8_t)byte;
  }
  return bytes;
}

static sherlo_image read_image(void) {
  sherlo_image image;
  if (scanf("%" SCNd32 " %" SCNd32 " %" SCNd32 " %" SCNd32, &image.width, &image.height,
            &image.stride_bytes, &image.format) != 4) {
    fprintf(stderr, "driver: bad image header\n");
    exit(2);
  }
  // A width, height or stride the core refuses still reads as many bytes as the test wrote.
  int64_t length = (int64_t)image.stride_bytes * image.height;
  image.pixels = read_hex_bytes(length > 0 ? (size_t)length : 0);
  return image;
}

int main(void) {
  sherlo_still_state *state = NULL;
  char command[32];
  while (scanf("%31s", command) == 1) {
    if (strcmp(command, "abi") == 0) {
      printf("%" PRId32 "\n", sherlo_core_abi());
    } else if (strcmp(command, "version") == 0) {
      printf("%s\n", sherlo_core_version());
    } else if (strcmp(command, "compare") == 0) {
      double threshold = 0;
      int32_t include_aa = 0;
      scanf("%lf %" SCNd32, &threshold, &include_aa);
      sherlo_image a = read_image();
      sherlo_image b = read_image();
      printf("%" PRId64 "\n", sherlo_count_different_pixels(&a, &b, threshold, include_aa));
      free((void *)a.pixels);
      free((void *)b.pixels);
    } else if (strcmp(command, "still_begin") == 0) {
      sherlo_still_params params;
      int64_t now_ms = 0;
      scanf("%" SCNd32 " %" SCNd32 " %" SCNd32 " %" SCNd64 " %lf %" SCNd32 " %" SCNd64,
            &params.required_still_pairs, &params.minimum_screenshots,
            &params.counts_first_screenshot, &params.time_limit_ms, &params.threshold,
            &params.include_aa, &now_ms);
      state = sherlo_still_begin(&params, now_ms);
      printf("%s\n", state != NULL ? "begun" : "refused");
    } else if (strcmp(command, "still_step") == 0) {
      int64_t now_ms = 0;
      int32_t focus_was_cleared = 0;
      scanf("%" SCNd64 " %" SCNd32, &now_ms, &focus_was_cleared);
      sherlo_image previous = read_image();
      sherlo_image current = read_image();
      int64_t different_pixels = 0;
      int32_t verdict =
          sherlo_still_step(state, &previous, &current, now_ms, focus_was_cleared, &different_pixels);
      printf("%" PRId32 " %" PRId64 "\n", verdict, different_pixels);
      free((void *)previous.pixels);
      free((void *)current.pixels);
    } else if (strcmp(command, "still_end") == 0) {
      sherlo_still_end(state);
      state = NULL;
      printf("ended\n");
    } else {
      fprintf(stderr, "driver: unknown command %s\n", command);
      return 2;
    }
  }
  return 0;
}
