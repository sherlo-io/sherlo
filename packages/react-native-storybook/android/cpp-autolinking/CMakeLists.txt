# The C++ half of Sherlo's native module, as React Native's C++ autolinking adds it to an app.
#
# React Native writes one C++ autolinking file for every build type of the app, and it adds this
# folder to all of them (react-native.config.js names it, with the setting off or unset). In return
# it expects a target named react_codegen_sherlo_codegen, a header sherlo_codegen.h, and a function
# sherlo_codegen_ModuleProvider, which it calls to find Sherlo's TurboModule.
#
# - The debug build links Sherlo and has run Sherlo's codegen, so it gets the generated glue from
#   the build folder, and the app finds Sherlo's TurboModule through it.
# - Any other build (a store build) does not link Sherlo, and gets the stand-in under the same
#   names: a provider that finds nothing, holding no Sherlo code.
#
# chooseGlue.cmake makes that choice. See "What each build carries" in the book.

cmake_minimum_required(VERSION 3.13)

set(GENERATED_GLUE_DIR "${CMAKE_CURRENT_LIST_DIR}/../build/generated/source/codegen/jni")
include("${CMAKE_CURRENT_LIST_DIR}/chooseGlue.cmake")

if(SHERLO_GLUE STREQUAL "generated")
  add_subdirectory("${GENERATED_GLUE_DIR}" sherlo_codegen_generated_glue)
else()
  add_library(react_codegen_sherlo_codegen OBJECT stand-in/sherlo_codegen.cpp)
  target_include_directories(react_codegen_sherlo_codegen PUBLIC stand-in)
  target_link_libraries(react_codegen_sherlo_codegen fbjni jsi reactnative)
  # The compiler options React Native's own headers need, as the generated glue sets them.
  target_compile_reactnative_options(react_codegen_sherlo_codegen PRIVATE)
endif()
