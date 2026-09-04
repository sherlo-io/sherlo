cmake_minimum_required(VERSION 3.13)

# Builds libsherloshim.so, the Android shim's native half. Pure JNI + dlfcn -
# no react-native or jsi headers needed, since the shim never inspects a
# capability by name; it only forwards to whatever the LD_PRELOADed
# implementation registers. See sherlo-shim-jni.cpp.
add_library(sherloshim SHARED src/main/cpp/sherlo-shim-jni.cpp)

find_library(log-lib log)
target_link_libraries(sherloshim ${log-lib})
