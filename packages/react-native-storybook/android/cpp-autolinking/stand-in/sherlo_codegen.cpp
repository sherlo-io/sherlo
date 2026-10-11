// The stand-in for Sherlo's generated module glue, in a build type that does not link Sherlo.
// That build has no Sherlo module, so the provider finds none, whatever it is asked for.
// See ../CMakeLists.txt.

#include "sherlo_codegen.h"

namespace facebook::react {

std::shared_ptr<TurboModule> sherlo_codegen_ModuleProvider(const std::string &moduleName, const JavaTurboModule::InitParams &params) {
  return nullptr;
}

} // namespace facebook::react
