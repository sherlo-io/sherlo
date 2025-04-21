cmake_minimum_required(VERSION 3.18)
project(sherlo_storybook LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)

# Make sure we use the shared STL
set(CMAKE_ANDROID_STL_TYPE c++_shared)

# Make sure the JNI header files are included
include_directories(${CMAKE_CURRENT_SOURCE_DIR})

# Add source files
add_library(
  sherlo_storybook
  SHARED
    NodeSerializer.cpp
    ShadowSerializerModule.cpp
)

# Find Android log library
find_library(log-lib log)

# Include directories
target_include_directories(
  sherlo_storybook
  PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
)

# Link libraries
target_link_libraries(
  sherlo_storybook
  ${log-lib}
)

# Set the library output name explicitly to ensure consistency
set_target_properties(
  sherlo_storybook
  PROPERTIES
  LIBRARY_OUTPUT_NAME "sherlo_storybook"
)
