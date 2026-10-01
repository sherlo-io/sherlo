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
//   scroll_pick <platform> <screen_width> <screen_height> <count> <candidate>...
//   scroll_candidate_is_eligible <platform> <screen_width> <screen_height> <candidate>
//   scroll_candidate_fits <platform> <screen_width> <screen_height> <candidate>
//   scroll_is_scrollable <platform> <metrics>
//   scroll_nudge_target <platform> <attempt> <metrics> <position before>
//   scroll_nudge_moved <platform> <position before> <position after>
//   checkpoint_plan <platform> <index> <step_px> <last_index> <metrics> <pixels_per_point>
//   checkpoint_read_back <actual_offset>
//   inspector_has_room <depth> <nodes_kept>
//   inspector_is_on_screen <top> <bottom> <viewport_top> <viewport_bottom>
//   inspector_json <platform> <density> <font_scale> <viewport_top> <viewport_bottom>
//                  <class_count> <class name>... <count> <node>...
// where <image> is: <width> <height> <stride_bytes> <format> <the stride * height bytes, in hex>;
// <metrics> is: <can_scroll> <is_shown> <viewport_height> <content_height> <inset_top>
// <inset_bottom> <scroll_extent>; <candidate> is: <class name> <is_hidden> <alpha> <metrics>
// <is_on_screen> <visible_width> <visible_height>; <position> is: <offset> <scroll_y>; <node> is:
// <depth> <class_index> <is_visible> <x> <y> <width> <height> <has_id> <id> <top> <bottom>; and a
// <class name> is "x" followed by its UTF-8 bytes in hex (so that an empty name is a word too).
// Numbers are read by strtod ("NaN", "Infinity" and "-0" included) and written back the same way.
#include <inttypes.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "sherlo_core.h"

static double read_number(void) {
  char word[64];
  if (scanf("%63s", word) != 1) {
    fprintf(stderr, "driver: a number is missing\n");
    exit(2);
  }
  return strtod(word, NULL);
}

static int64_t read_integer(void) { return (int64_t)read_number(); }

static void print_number(double value) {
  if (isnan(value)) {
    printf("NaN");
  } else if (isinf(value)) {
    printf(value > 0 ? "Infinity" : "-Infinity");
  } else if (value == 0 && signbit(value)) {
    printf("-0");
  } else {
    printf("%.17g", value);
  }
}

// A class name: "x" and its bytes in hex. The caller frees it.
static char *read_class_name(void) {
  static char word[8192];
  if (scanf("%8191s", word) != 1 || word[0] != 'x') {
    fprintf(stderr, "driver: bad class name\n");
    exit(2);
  }
  size_t length = (strlen(word) - 1) / 2;
  char *name = malloc(length + 1);
  for (size_t index = 0; index < length; index++) {
    unsigned int byte = 0;
    sscanf(word + 1 + index * 2, "%2x", &byte);
    name[index] = (char)byte;
  }
  name[length] = '\0';
  return name;
}

static sherlo_scroll_metrics read_metrics(void) {
  sherlo_scroll_metrics metrics;
  metrics.can_scroll = (int32_t)read_integer();
  metrics.is_shown = (int32_t)read_integer();
  metrics.viewport_height = read_number();
  metrics.content_height = read_number();
  metrics.inset_top = read_number();
  metrics.inset_bottom = read_number();
  metrics.scroll_extent = read_number();
  return metrics;
}

static sherlo_scroll_position read_position(void) {
  sherlo_scroll_position position;
  position.offset = read_number();
  position.scroll_y = read_number();
  return position;
}

// A candidate; the caller frees its class name.
static sherlo_scroll_candidate read_candidate(void) {
  sherlo_scroll_candidate candidate;
  candidate.class_name = read_class_name();
  candidate.is_hidden = (int32_t)read_integer();
  candidate.alpha = read_number();
  candidate.metrics = read_metrics();
  candidate.is_on_screen = (int32_t)read_integer();
  candidate.visible_width = read_number();
  candidate.visible_height = read_number();
  return candidate;
}

// scroll_candidate_is_eligible and scroll_candidate_fits:
// <platform> <screen_width> <screen_height> <candidate>
static void scroll_candidate(int ask_fits) {
  int32_t platform = (int32_t)read_integer();
  double screen_width = read_number();
  double screen_height = read_number();
  sherlo_scroll_candidate candidate = read_candidate();
  int32_t answer = ask_fits
                       ? sherlo_scroll_candidate_fits(platform, &candidate, screen_width, screen_height)
                       : sherlo_scroll_candidate_is_eligible(platform, &candidate);
  printf("%" PRId32 "\n", answer);
  free((void *)candidate.class_name);
}

static void scroll_pick(void) {
  int32_t platform = (int32_t)read_integer();
  double screen_width = read_number();
  double screen_height = read_number();
  int32_t count = (int32_t)read_integer();
  sherlo_scroll_candidate *candidates = calloc(count > 0 ? (size_t)count : 1, sizeof(*candidates));
  for (int32_t index = 0; index < count; index++) candidates[index] = read_candidate();
  printf("%" PRId32 "\n", sherlo_scroll_pick(platform, candidates, count, screen_width, screen_height));
  for (int32_t index = 0; index < count; index++) free((void *)candidates[index].class_name);
  free(candidates);
}

static void inspector_json(void) {
  int32_t platform = (int32_t)read_integer();
  double density = read_number();
  double font_scale = read_number();
  double viewport_top = read_number();
  double viewport_bottom = read_number();
  int32_t class_count = (int32_t)read_integer();
  char **class_names = calloc(class_count > 0 ? (size_t)class_count : 1, sizeof(char *));
  for (int32_t index = 0; index < class_count; index++) class_names[index] = read_class_name();
  int32_t count = (int32_t)read_integer();
  sherlo_inspector_node *nodes = calloc(count > 0 ? (size_t)count : 1, sizeof(*nodes));
  for (int32_t index = 0; index < count; index++) {
    sherlo_inspector_node *node = &nodes[index];
    node->depth = (int32_t)read_integer();
    node->class_index = (int32_t)read_integer();
    node->is_visible = (int32_t)read_integer();
    node->x = read_number();
    node->y = read_number();
    node->width = read_number();
    node->height = read_number();
    node->has_id = (int32_t)read_integer();
    node->id = read_integer();
    node->top = read_number();
    node->bottom = read_number();
  }

  int64_t length = 0;
  char *json = sherlo_inspector_json(platform, nodes, count, (const char *const *)class_names,
                                     class_count, density, font_scale, viewport_top,
                                     viewport_bottom, &length);
  if (json == NULL) {
    printf("null %" PRId64 "\n", length);
  } else {
    printf("%" PRId64 " ", length);
    for (int64_t index = 0; index < length; index++) printf("%02x", (unsigned char)json[index]);
    printf("\n");
  }
  sherlo_free(json);
  for (int32_t index = 0; index < class_count; index++) free(class_names[index]);
  free(class_names);
  free(nodes);
}

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
  sherlo_checkpoint_plan plan;
  memset(&plan, 0, sizeof(plan));
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
    } else if (strcmp(command, "scroll_pick") == 0) {
      scroll_pick();
    } else if (strcmp(command, "scroll_candidate_is_eligible") == 0) {
      scroll_candidate(0);
    } else if (strcmp(command, "scroll_candidate_fits") == 0) {
      scroll_candidate(1);
    } else if (strcmp(command, "scroll_is_scrollable") == 0) {
      int32_t platform = (int32_t)read_integer();
      sherlo_scroll_metrics metrics = read_metrics();
      printf("%" PRId32 "\n", sherlo_scroll_is_scrollable(platform, &metrics));
    } else if (strcmp(command, "scroll_nudge_target") == 0) {
      int32_t platform = (int32_t)read_integer();
      int32_t attempt = (int32_t)read_integer();
      sherlo_scroll_metrics metrics = read_metrics();
      sherlo_scroll_position before = read_position();
      double target = 0;
      int32_t answer = sherlo_scroll_nudge_target(platform, attempt, &metrics, &before, &target);
      printf("%" PRId32 " ", answer);
      print_number(target);
      printf("\n");
    } else if (strcmp(command, "scroll_nudge_moved") == 0) {
      int32_t platform = (int32_t)read_integer();
      sherlo_scroll_position before = read_position();
      sherlo_scroll_position after = read_position();
      printf("%" PRId32 "\n", sherlo_scroll_nudge_moved(platform, &before, &after));
    } else if (strcmp(command, "checkpoint_plan") == 0) {
      int32_t platform = (int32_t)read_integer();
      int64_t index = read_integer();
      double step_px = read_number();
      int64_t last_index = read_integer();
      sherlo_scroll_metrics metrics = read_metrics();
      double pixels_per_point = read_number();
      int32_t answer = sherlo_checkpoint_plan_for(platform, index, step_px, last_index, &metrics,
                                                  pixels_per_point, &plan);
      printf("%" PRId32 " %" PRId64 " ", answer, plan.applied_index);
      print_number(plan.target_offset);
      printf("\n");
    } else if (strcmp(command, "checkpoint_read_back") == 0) {
      double actual_offset = read_number();
      sherlo_checkpoint_result result;
      memset(&result, 0, sizeof(result));
      int32_t answer = sherlo_checkpoint_read_back(&plan, actual_offset, &result);
      printf("%" PRId32 " %" PRId32 " %" PRId64 " ", answer, result.reached_bottom,
             result.applied_index);
      print_number(result.applied_offset_px);
      printf(" ");
      print_number(result.viewport_px);
      printf(" ");
      print_number(result.content_px);
      printf("\n");
    } else if (strcmp(command, "inspector_has_room") == 0) {
      int32_t depth = (int32_t)read_integer();
      int32_t nodes_kept = (int32_t)read_integer();
      printf("%" PRId32 "\n", sherlo_inspector_has_room(depth, nodes_kept));
    } else if (strcmp(command, "inspector_is_on_screen") == 0) {
      double top = read_number();
      double bottom = read_number();
      double viewport_top = read_number();
      double viewport_bottom = read_number();
      printf("%" PRId32 "\n", sherlo_inspector_is_on_screen(top, bottom, viewport_top, viewport_bottom));
    } else if (strcmp(command, "inspector_json") == 0) {
      inspector_json();
    } else {
      fprintf(stderr, "driver: unknown command %s\n", command);
      return 2;
    }
  }
  return 0;
}
