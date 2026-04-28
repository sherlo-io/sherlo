cmake_minimum_required(VERSION 3.13)
project(sherlo_jsi)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_VERBOSE_MAKEFILE on)

find_package(ReactAndroid REQUIRED CONFIG)
find_package(fbjni REQUIRED CONFIG)

add_library(
  sherlo_jsi
  SHARED
  src/main/cpp/SherloModuleJSIBindings.cpp
  src/main/cpp/OnLoad.cpp
)

target_include_directories(sherlo_jsi PRIVATE src/main/cpp)

target_link_libraries(
  sherlo_jsi
  fbjni::fbjni
  ReactAndroid::jsi
  ReactAndroid::reactnative
  android
  log
)
