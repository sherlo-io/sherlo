# CMakeLists.txt for @sherlo/react-native-storybook
#
# Builds libsherlo.so - a minimal JNI helper that reads
# globalThis.__sherloLastJsError from the JSI Runtime, used to recover
# the original JS error message on old-arch Android.
#
# ── Why we compile jsi.cpp instead of using find_package(ReactAndroid) ────────
#
# find_package(ReactAndroid REQUIRED CONFIG) resolves via Gradle prefab and
# tries to import ALL ReactAndroid components, including "hermestooling" (a
# host-only build tool that has no ARM prebuilts). This throws:
#   com.google.prefab.api.NoMatchingLibraryException: No compatible library
#   found for //ReactAndroid/hermestooling.
#
# Instead we compile jsi.cpp directly alongside our JNI glue code.  JSI has no
# global state that would conflict with the copy already compiled into
# libhermes.so; all symbols are marked hidden so they never escape the .so,
# eliminating any ODR risk.
#
# REACT_NATIVE_DIR is passed from build.gradle (resolveReactNativeDir()).
# ─────────────────────────────────────────────────────────────────────────────

cmake_minimum_required(VERSION 3.13)
project(sherlo)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT DEFINED REACT_NATIVE_DIR OR REACT_NATIVE_DIR STREQUAL "")
  message(FATAL_ERROR
    "[sherlo] REACT_NATIVE_DIR is not set. "
    "Pass it via cmake.arguments in android/build.gradle.")
endif()

set(JSI_DIR "${REACT_NATIVE_DIR}/ReactCommon/jsi")

add_library(sherlo SHARED
  src/main/cpp/SherloJsiReader.cpp
  ${JSI_DIR}/jsi/jsi.cpp
)

# Include JSI headers from the react-native source tree.
target_include_directories(sherlo PRIVATE ${JSI_DIR})

# Hide ALL symbols by default so our locally compiled JSI copy never leaks
# into the process symbol table and conflicts with libhermes.so's copy.
# The JNI entry point keeps its default visibility because it uses JNIEXPORT
# which expands to __attribute__((visibility("default"))).
set_target_properties(sherlo PROPERTIES
  CXX_VISIBILITY_PRESET hidden
  VISIBILITY_INLINES_HIDDEN YES
)

target_link_libraries(sherlo
  android
  log
)
