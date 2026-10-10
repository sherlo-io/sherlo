// The stand-in for Sherlo's generated module glue, in a build type that does not link Sherlo.
// It declares what React Native's C++ autolinking calls, as Sherlo's codegen would.
// See ../CMakeLists.txt.

#pragma once

#include <ReactCommon/JavaTurboModule.h>
#include <ReactCommon/TurboModule.h>
#include <jsi/jsi.h>

namespace facebook::react {

JSI_EXPORT
std::shared_ptr<TurboModule> sherlo_codegen_ModuleProvider(const std::string &moduleName, const JavaTurboModule::InitParams &params);

} // namespace facebook::react
