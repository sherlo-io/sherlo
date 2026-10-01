// The stillness decision: is the screen still, moving, or not decided yet?
//
// The rules are the loops the SDK ran before this core: ios/StabilityHelper.m and Android's
// StabilityHelper.checkIfStable. Each step compares the newest screenshot with the one before, and
// then:
//   - a pair with no differing pixel adds one to the still pairs in a row; any other pair, a pair of
//     different sizes included, sets them back to none;
//   - a cleared focus (Android) sets them back to none, and starts the clock again;
//   - enough still pairs in a row: the screen is still;
//   - else the time limit passed, the latest pair differed, and enough screenshots were taken: the
//     screen is moving. The time is the one measured before the clock was started again.
#include <stdlib.h>

#include "sherlo_core.h"

struct sherlo_still_state {
  sherlo_still_params params;
  int64_t clock_start_ms;
  int32_t pairs_compared;
  int32_t still_pairs_in_a_row;
};

sherlo_still_state *sherlo_still_begin(const sherlo_still_params *params, int64_t now_ms) {
  if (params == NULL) return NULL;
  sherlo_still_state *state = calloc(1, sizeof(sherlo_still_state));
  if (state == NULL) return NULL;
  state->params = *params;
  state->clock_start_ms = now_ms;
  return state;
}

static int32_t screenshots_taken(const sherlo_still_state *state) {
  int32_t first_screenshot = state->params.counts_first_screenshot ? 1 : 0;
  return state->pairs_compared + first_screenshot;
}

int32_t sherlo_still_step(sherlo_still_state *state, const sherlo_image *previous,
                          const sherlo_image *current, int64_t now_ms, int32_t focus_was_cleared,
                          int64_t *different_pixels) {
  if (different_pixels == NULL) return SHERLO_ERROR_BAD_ARGUMENT;
  if (state == NULL) {
    *different_pixels = SHERLO_ERROR_BAD_ARGUMENT;
    return SHERLO_ERROR_BAD_ARGUMENT;
  }

  // Both platforms compared the newest screenshot against the one before, in that order.
  int64_t differing = sherlo_count_different_pixels(current, previous, state->params.threshold,
                                                    state->params.include_aa);
  *different_pixels = differing;
  if (differing == SHERLO_ERROR_BAD_ARGUMENT) return SHERLO_ERROR_BAD_ARGUMENT;

  state->pairs_compared++;
  if (differing == 0) {
    state->still_pairs_in_a_row++;
  } else {
    state->still_pairs_in_a_row = 0;
  }

  int64_t elapsed_ms = now_ms - state->clock_start_ms;
  if (focus_was_cleared) {
    state->still_pairs_in_a_row = 0;
    state->clock_start_ms = now_ms;
  }

  if (state->still_pairs_in_a_row >= state->params.required_still_pairs) {
    return SHERLO_STILL_STABLE;
  }
  if (elapsed_ms >= state->params.time_limit_ms && state->still_pairs_in_a_row == 0 &&
      screenshots_taken(state) >= state->params.minimum_screenshots) {
    return SHERLO_STILL_UNSTABLE;
  }
  return SHERLO_STILL_CONTINUE;
}

void sherlo_still_end(sherlo_still_state *state) { free(state); }
