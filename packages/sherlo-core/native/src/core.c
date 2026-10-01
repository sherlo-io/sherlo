// The core's identity: its version and the ABI it speaks.
#include <stdlib.h>

#include "sherlo_core.h"

// The build names the version (packages/sherlo-core/native/build.js reads it from lerna.json).
#ifndef SHERLO_CORE_VERSION
#define SHERLO_CORE_VERSION "0.0.0"
#endif

const char *sherlo_core_version(void) { return SHERLO_CORE_VERSION; }

int32_t sherlo_core_abi(void) { return SHERLO_CORE_ABI; }

void sherlo_free(void *memory) { free(memory); }
