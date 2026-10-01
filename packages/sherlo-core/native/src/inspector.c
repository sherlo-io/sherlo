// The inspector: the views on screen, written as the JSON getInspectorData answers.
//
// The rules are the ones the SDK ran before this core: ios/InspectorHelper.m and Android's
// InspectorHelper.java. A view is written with its children; a child is left out, with everything
// inside it, when it is deeper than 50 levels below the root, when 10000 views are written already,
// or when it is wholly above or below the viewport.
//
// The JSON is each platform's writer's, byte for byte, as the parity fixtures recorded them:
//   - iOS's NSJSONSerialization writes a dictionary's names in the order the dictionary keeps them,
//     which depends on which names it holds (IOS_NAME_ORDERS below), a number as "%.17g", and leaves
//     out a number that is not finite (InspectorHelper.m never put one in).
//   - Android's org.json writes names in the order they were put, a number whose value is a whole
//     long as that long, any other as Java's Double.toString, and refuses one that is not finite.
//   - Both escape '"', '\\' and '/' with a backslash, the five short control escapes, and every
//     other byte below 0x20 as \u00xx; every other byte is written as it is.
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "sherlo_core.h"

// The limits both platforms walked the tree with.
#define MAX_DEPTH 50
#define MAX_NODES 10000

int32_t sherlo_inspector_has_room(int32_t depth, int32_t nodes_kept) {
  return depth <= MAX_DEPTH && nodes_kept < MAX_NODES;
}

int32_t sherlo_inspector_is_on_screen(double top, double bottom, double viewport_top,
                                      double viewport_bottom) {
  // As both platforms wrote it, so that a NaN edge keeps the view.
  return !(bottom <= viewport_top || top >= viewport_bottom);
}

// ---- The text being written ----------------------------------------------------------------------

typedef struct text {
  char *bytes;
  size_t length;
  size_t capacity;
  int out_of_memory;
} text;

static void append_bytes(text *out, const char *bytes, size_t length) {
  if (out->out_of_memory) return;
  if (out->length + length + 1 > out->capacity) {
    size_t capacity = out->capacity > 0 ? out->capacity : 4096;
    while (out->length + length + 1 > capacity) capacity *= 2;
    char *grown = realloc(out->bytes, capacity);
    if (grown == NULL) {
      out->out_of_memory = 1;
      return;
    }
    out->bytes = grown;
    out->capacity = capacity;
  }
  memcpy(out->bytes + out->length, bytes, length);
  out->length += length;
  out->bytes[out->length] = '\0';
}

static void append(text *out, const char *string) { append_bytes(out, string, strlen(string)); }

static void append_json_string(text *out, const char *value) {
  append(out, "\"");
  for (const unsigned char *byte = (const unsigned char *)value; *byte != '\0'; byte++) {
    char escaped[8];
    switch (*byte) {
      case '"': append(out, "\\\""); break;
      case '\\': append(out, "\\\\"); break;
      case '/': append(out, "\\/"); break;
      case '\b': append(out, "\\b"); break;
      case '\f': append(out, "\\f"); break;
      case '\n': append(out, "\\n"); break;
      case '\r': append(out, "\\r"); break;
      case '\t': append(out, "\\t"); break;
      default:
        if (*byte < 0x20) {
          snprintf(escaped, sizeof escaped, "\\u%04x", *byte);
          append(out, escaped);
        } else {
          append_bytes(out, (const char *)byte, 1);
        }
    }
  }
  append(out, "\"");
}

static void append_integer(text *out, int64_t value) {
  char written[24];
  snprintf(written, sizeof written, "%lld", (long long)value);
  append(out, written);
}

// ---- Numbers, as each platform wrote them --------------------------------------------------------

static void append_ios_number(text *out, double value) {
  char written[32];
  snprintf(written, sizeof written, "%.17g", value);
  append(out, written);
}

// Java's Double.toString: the fewest digits that read back as the same double, written plainly
// from 10^-3 up to 10^7 ("0.001", "2.625") and in Java's E notation outside it ("9.99E-5").
static void append_java_double(text *out, double value) {
  char scientific[40];
  for (int digits_after_point = 0; digits_after_point <= 16; digits_after_point++) {
    snprintf(scientific, sizeof scientific, "%.*e", digits_after_point, value);
    if (strtod(scientific, NULL) == value) break;
  }

  // scientific is "[-]d[.ddd]e[+-]x": take its digits and its exponent apart.
  char digits[24];
  size_t digit_count = 0;
  const char *at = scientific;
  if (*at == '-') {
    append(out, "-");
    at++;
  }
  for (; *at != 'e'; at++) {
    if (*at != '.') digits[digit_count++] = *at;
  }
  int exponent = atoi(at + 1);
  while (digit_count > 1 && digits[digit_count - 1] == '0') digit_count--;
  digits[digit_count] = '\0';

  double magnitude = fabs(value);
  char written[64];
  size_t length = 0;
  if (magnitude >= 1e-3 && magnitude < 1e7) {
    if (exponent >= 0) {
      for (int place = 0; place <= exponent; place++) {
        written[length++] = (size_t)place < digit_count ? digits[place] : '0';
      }
      written[length++] = '.';
      if ((size_t)exponent + 1 < digit_count) {
        for (size_t place = (size_t)exponent + 1; place < digit_count; place++) {
          written[length++] = digits[place];
        }
      } else {
        written[length++] = '0';
      }
    } else {
      written[length++] = '0';
      written[length++] = '.';
      for (int zero = 0; zero < -exponent - 1; zero++) written[length++] = '0';
      for (size_t place = 0; place < digit_count; place++) written[length++] = digits[place];
    }
    written[length] = '\0';
  } else {
    snprintf(written, sizeof written, "%c.%sE%d", digits[0], digit_count > 1 ? digits + 1 : "0",
             exponent);
  }
  append(out, written);
}

// org.json's numberToString: -0 as "-0", a whole long as that long, any other number as Java's
// Double.toString. An Android int arrives here as its exact double, and is written as the int.
static void append_android_number(text *out, double value) {
  if (value == 0 && signbit(value)) {
    append(out, "-0");
    return;
  }
  // Java's (long) cast: it saturates at the ends of the long range.
  int64_t as_long;
  if (value >= 9223372036854775807.0) {
    as_long = INT64_MAX;
  } else if (value <= -9223372036854775808.0) {
    as_long = INT64_MIN;
  } else {
    as_long = (int64_t)value;
  }
  if (value == (double)as_long) {
    append_integer(out, as_long);
  } else {
    append_java_double(out, value);
  }
}

// ---- A view's names ------------------------------------------------------------------------------

typedef enum view_name {
  NAME_END,
  NAME_CLASS_NAME,
  NAME_IS_VISIBLE,
  NAME_X,
  NAME_Y,
  NAME_WIDTH,
  NAME_HEIGHT,
  NAME_ID,
  NAME_CHILDREN,
} view_name;

// Which of the names a view may leave out it holds, as an index into IOS_NAME_ORDERS.
#define HOLDS_X 1
#define HOLDS_Y 2
#define HOLDS_WIDTH 4
#define HOLDS_HEIGHT 8
#define HOLDS_ID 16

// The order NSJSONSerialization wrote a view's names in, for each set of names the view held: the
// order Foundation's dictionary keeps them in. Recorded from the original InspectorHelper.m, one
// view for each set ("every set of names a view writes" in the parity fixtures).
static const view_name IOS_NAME_ORDERS[32][9] = {
    // 0: no x, y, width, height or id
    {NAME_CLASS_NAME, NAME_CHILDREN, NAME_IS_VISIBLE},
    // 1: x
    {NAME_IS_VISIBLE, NAME_CLASS_NAME, NAME_X, NAME_CHILDREN},
    // 2: y
    {NAME_Y, NAME_IS_VISIBLE, NAME_CLASS_NAME, NAME_CHILDREN},
    // 3: x y
    {NAME_Y, NAME_IS_VISIBLE, NAME_CLASS_NAME, NAME_X, NAME_CHILDREN},
    // 4: width
    {NAME_IS_VISIBLE, NAME_CLASS_NAME, NAME_WIDTH, NAME_CHILDREN},
    // 5: x width
    {NAME_IS_VISIBLE, NAME_CLASS_NAME, NAME_X, NAME_WIDTH, NAME_CHILDREN},
    // 6: y width
    {NAME_Y, NAME_IS_VISIBLE, NAME_CLASS_NAME, NAME_WIDTH, NAME_CHILDREN},
    // 7: x y width
    {NAME_Y, NAME_IS_VISIBLE, NAME_CLASS_NAME, NAME_X, NAME_WIDTH, NAME_CHILDREN},
    // 8: height
    {NAME_IS_VISIBLE, NAME_CLASS_NAME, NAME_HEIGHT, NAME_CHILDREN},
    // 9: x height
    {NAME_IS_VISIBLE, NAME_CLASS_NAME, NAME_X, NAME_HEIGHT, NAME_CHILDREN},
    // 10: y height
    {NAME_Y, NAME_IS_VISIBLE, NAME_CLASS_NAME, NAME_HEIGHT, NAME_CHILDREN},
    // 11: x y height
    {NAME_Y, NAME_IS_VISIBLE, NAME_CLASS_NAME, NAME_X, NAME_HEIGHT, NAME_CHILDREN},
    // 12: width height
    {NAME_IS_VISIBLE, NAME_CLASS_NAME, NAME_WIDTH, NAME_HEIGHT, NAME_CHILDREN},
    // 13: x width height
    {NAME_CHILDREN, NAME_IS_VISIBLE, NAME_CLASS_NAME, NAME_X, NAME_WIDTH, NAME_HEIGHT},
    // 14: y width height
    {NAME_Y, NAME_IS_VISIBLE, NAME_CLASS_NAME, NAME_WIDTH, NAME_HEIGHT, NAME_CHILDREN},
    // 15: x y width height
    {NAME_X, NAME_HEIGHT, NAME_Y, NAME_CLASS_NAME, NAME_CHILDREN, NAME_WIDTH, NAME_IS_VISIBLE},
    // 16: id
    {NAME_ID, NAME_CLASS_NAME, NAME_IS_VISIBLE, NAME_CHILDREN},
    // 17: id x
    {NAME_IS_VISIBLE, NAME_CLASS_NAME, NAME_ID, NAME_X, NAME_CHILDREN},
    // 18: id y
    {NAME_Y, NAME_IS_VISIBLE, NAME_CLASS_NAME, NAME_ID, NAME_CHILDREN},
    // 19: id x y
    {NAME_Y, NAME_IS_VISIBLE, NAME_CLASS_NAME, NAME_ID, NAME_X, NAME_CHILDREN},
    // 20: id width
    {NAME_IS_VISIBLE, NAME_CLASS_NAME, NAME_ID, NAME_WIDTH, NAME_CHILDREN},
    // 21: id x width
    {NAME_IS_VISIBLE, NAME_CLASS_NAME, NAME_ID, NAME_X, NAME_WIDTH, NAME_CHILDREN},
    // 22: id y width
    {NAME_Y, NAME_IS_VISIBLE, NAME_CLASS_NAME, NAME_ID, NAME_WIDTH, NAME_CHILDREN},
    // 23: id x y width
    {NAME_X, NAME_Y, NAME_CLASS_NAME, NAME_ID, NAME_WIDTH, NAME_CHILDREN, NAME_IS_VISIBLE},
    // 24: id height
    {NAME_IS_VISIBLE, NAME_CLASS_NAME, NAME_ID, NAME_HEIGHT, NAME_CHILDREN},
    // 25: id x height
    {NAME_IS_VISIBLE, NAME_CLASS_NAME, NAME_ID, NAME_X, NAME_HEIGHT, NAME_CHILDREN},
    // 26: id y height
    {NAME_Y, NAME_IS_VISIBLE, NAME_CLASS_NAME, NAME_ID, NAME_HEIGHT, NAME_CHILDREN},
    // 27: id x y height
    {NAME_X, NAME_HEIGHT, NAME_Y, NAME_CLASS_NAME, NAME_ID, NAME_CHILDREN, NAME_IS_VISIBLE},
    // 28: id width height
    {NAME_IS_VISIBLE, NAME_CLASS_NAME, NAME_ID, NAME_WIDTH, NAME_HEIGHT, NAME_CHILDREN},
    // 29: id x width height
    {NAME_X, NAME_HEIGHT, NAME_CHILDREN, NAME_CLASS_NAME, NAME_ID, NAME_WIDTH, NAME_IS_VISIBLE},
    // 30: id y width height
    {NAME_HEIGHT, NAME_Y, NAME_CLASS_NAME, NAME_ID, NAME_WIDTH, NAME_CHILDREN, NAME_IS_VISIBLE},
    // 31: every name
    {NAME_X, NAME_HEIGHT, NAME_Y, NAME_CLASS_NAME, NAME_ID, NAME_WIDTH, NAME_CHILDREN,
     NAME_IS_VISIBLE},
};

// org.json kept the order InspectorHelper.java put the names in. The id is left out when there is
// none.
static const view_name ANDROID_NAME_ORDER[9] = {NAME_CLASS_NAME, NAME_IS_VISIBLE, NAME_X,
                                                 NAME_Y,          NAME_WIDTH,      NAME_HEIGHT,
                                                 NAME_ID,         NAME_CHILDREN};

static const view_name *name_order_for(int32_t platform, const sherlo_inspector_node *node) {
  if (platform == SHERLO_PLATFORM_ANDROID) return ANDROID_NAME_ORDER;
  int holds = 0;
  if (isfinite(node->x)) holds |= HOLDS_X;
  if (isfinite(node->y)) holds |= HOLDS_Y;
  if (isfinite(node->width)) holds |= HOLDS_WIDTH;
  if (isfinite(node->height)) holds |= HOLDS_HEIGHT;
  if (node->has_id) holds |= HOLDS_ID;
  return IOS_NAME_ORDERS[holds];
}

static void append_number(text *out, int32_t platform, double value) {
  if (platform == SHERLO_PLATFORM_IOS) {
    append_ios_number(out, value);
  } else {
    append_android_number(out, value);
  }
}

// One name and its value. The children's name opens their array; closing it is the caller's.
static void append_name(text *out, int32_t platform, const sherlo_inspector_node *node,
                        const char *class_name, view_name name, int *is_first) {
  // A number iOS left out, and an id Android had none of, write nothing.
  double number = 0;
  const char *written_name = NULL;
  switch (name) {
    case NAME_X: number = node->x; written_name = "x"; break;
    case NAME_Y: number = node->y; written_name = "y"; break;
    case NAME_WIDTH: number = node->width; written_name = "width"; break;
    case NAME_HEIGHT: number = node->height; written_name = "height"; break;
    default: break;
  }
  if (written_name != NULL && platform == SHERLO_PLATFORM_IOS && !isfinite(number)) return;
  if (name == NAME_ID && !node->has_id) return;

  if (!*is_first) append(out, ",");
  *is_first = 0;
  switch (name) {
    case NAME_CLASS_NAME:
      append(out, "\"className\":");
      append_json_string(out, class_name);
      break;
    case NAME_IS_VISIBLE:
      append(out, node->is_visible ? "\"isVisible\":true" : "\"isVisible\":false");
      break;
    case NAME_ID:
      append(out, "\"id\":");
      append_integer(out, node->id);
      break;
    case NAME_CHILDREN:
      append(out, "\"children\":[");
      break;
    default:
      append(out, "\"");
      append(out, written_name);
      append(out, "\":");
      append_number(out, platform, number);
  }
}

// ---- The tree ------------------------------------------------------------------------------------

// A view whose children are being written: its names after "children" are written when they end.
typedef struct open_view {
  const sherlo_inspector_node *node;
  const char *class_name;
  const view_name *names_after_children;
  int wrote_a_child;
} open_view;

static void open_a_view(text *out, int32_t platform, open_view *view) {
  append(out, "{");
  int is_first = 1;
  const view_name *name = name_order_for(platform, view->node);
  for (; *name != NAME_END; name++) {
    append_name(out, platform, view->node, view->class_name, *name, &is_first);
    if (*name == NAME_CHILDREN) break;
  }
  view->names_after_children = name + 1;
  view->wrote_a_child = 0;
}

static void close_a_view(text *out, int32_t platform, const open_view *view) {
  append(out, "]");
  int is_first = 0;
  for (const view_name *name = view->names_after_children; *name != NAME_END; name++) {
    append_name(out, platform, view->node, view->class_name, *name, &is_first);
  }
  append(out, "}");
}

// The nodes are a tree in pre-order: the root first at depth 0, each next node at most one level
// deeper than the one before, and every class index in the table.
static int is_a_tree(const sherlo_inspector_node *nodes, int32_t count,
                     const char *const *class_names, int32_t class_count) {
  if (nodes == NULL || count < 1 || nodes[0].depth != 0) return 0;
  if (class_names == NULL || class_count < 0) return 0;
  for (int32_t index = 0; index < count; index++) {
    const sherlo_inspector_node *node = &nodes[index];
    if (index > 0 && (node->depth < 1 || node->depth > nodes[index - 1].depth + 1)) return 0;
    if (node->class_index < 0 || node->class_index >= class_count) return 0;
    if (class_names[node->class_index] == NULL) return 0;
  }
  return 1;
}

static void append_tree(text *out, int32_t platform, const sherlo_inspector_node *nodes,
                        int32_t count, const char *const *class_names, double viewport_top,
                        double viewport_bottom) {
  // The views being written, the root at the bottom: one for each depth down to the latest view.
  open_view open[MAX_DEPTH + 1];
  int32_t open_count = 0;
  int32_t nodes_kept = 0;
  // The depth of the child being left out with everything inside it, or -1.
  int32_t left_out_depth = -1;

  for (int32_t index = 0; index < count; index++) {
    const sherlo_inspector_node *node = &nodes[index];
    if (left_out_depth >= 0 && node->depth > left_out_depth) continue;
    left_out_depth = -1;

    int is_root = index == 0;
    if (!is_root && !(sherlo_inspector_has_room(node->depth, nodes_kept) &&
                      sherlo_inspector_is_on_screen(node->top, node->bottom, viewport_top,
                                                    viewport_bottom))) {
      left_out_depth = node->depth;
      continue;
    }

    while (open_count > node->depth) close_a_view(out, platform, &open[--open_count]);
    if (open_count > 0) {
      open_view *parent = &open[open_count - 1];
      if (parent->wrote_a_child) append(out, ",");
      parent->wrote_a_child = 1;
    }
    open_view *view = &open[open_count++];
    view->node = node;
    view->class_name = class_names[node->class_index];
    open_a_view(out, platform, view);
    nodes_kept++;
  }
  while (open_count > 0) close_a_view(out, platform, &open[--open_count]);
}

char *sherlo_inspector_json(int32_t platform, const sherlo_inspector_node *nodes, int32_t count,
                            const char *const *class_names, int32_t class_count, double density,
                            double font_scale, double viewport_top, double viewport_bottom,
                            int64_t *length) {
  if (length == NULL) return NULL;
  *length = SHERLO_ERROR_BAD_ARGUMENT;
  if (platform != SHERLO_PLATFORM_IOS && platform != SHERLO_PLATFORM_ANDROID) return NULL;
  if (!is_a_tree(nodes, count, class_names, class_count)) return NULL;
  // org.json refused a number that is not finite, and getInspectorData rejected.
  if (platform == SHERLO_PLATFORM_ANDROID && (!isfinite(density) || !isfinite(font_scale))) {
    return NULL;
  }

  text out = {0};
  append(&out, "{");
  // The root object holds density, fontScale and viewHierarchy, in that order on both platforms;
  // iOS left out a density or font scale that is not finite.
  if (platform == SHERLO_PLATFORM_ANDROID || isfinite(density)) {
    append(&out, "\"density\":");
    append_number(&out, platform, density);
    append(&out, ",");
  }
  if (platform == SHERLO_PLATFORM_ANDROID || isfinite(font_scale)) {
    append(&out, "\"fontScale\":");
    append_number(&out, platform, font_scale);
    append(&out, ",");
  }
  append(&out, "\"viewHierarchy\":");
  append_tree(&out, platform, nodes, count, class_names, viewport_top, viewport_bottom);
  append(&out, "}");

  if (out.out_of_memory) {
    free(out.bytes);
    return NULL;
  }
  *length = (int64_t)out.length;
  return out.bytes;
}
