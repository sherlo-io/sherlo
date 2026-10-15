# Which C++ glue a build of the app links for Sherlo's native module: CMakeLists.txt beside this
# file includes it, and src/__tests__/nativeLinking.test.ts runs it alone with `cmake -P`.
#
# In:  CMAKE_BUILD_TYPE    Debug for the app's debug build type, RelWithDebInfo for a release one
#      GENERATED_GLUE_DIR  the folder Sherlo's codegen writes, in the package's android/build
# Out: SHERLO_GLUE         "generated" or "stand-in"
#
# It decides by build type, never by whether the folder is there: a debug build links Sherlo (see
# react-native.config.js), so it must have the generated glue; any other build does not link Sherlo,
# so it takes the stand-in even when an earlier debug build left the generated glue behind.

if(CMAKE_BUILD_TYPE STREQUAL "Debug")
  if(NOT EXISTS "${GENERATED_GLUE_DIR}/CMakeLists.txt")
    message(FATAL_ERROR
      "[sherlo] A debug build links Sherlo's native module, but Sherlo's codegen has not written "
      "its C++ glue: ${GENERATED_GLUE_DIR}/CMakeLists.txt is missing. Its Gradle task "
      "generateCodegenArtifactsFromSchema must run before this configure step.")
  endif()
  set(SHERLO_GLUE "generated")
else()
  set(SHERLO_GLUE "stand-in")
endif()

message(STATUS "[sherlo] SHERLO_GLUE=${SHERLO_GLUE} (CMAKE_BUILD_TYPE=${CMAKE_BUILD_TYPE})")
