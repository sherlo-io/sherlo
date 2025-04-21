#include "NodeSerializer.h"

namespace facebook {
namespace react {

// Stub implementation that doesn't require React's internal headers
std::shared_ptr<const ShadowNode> getRootShadowNode(int surfaceId) {
  // Return nullptr as we're just stubbing this out for now
  return nullptr;
}

std::string serializeNodeToJson(const ShadowNode &node) {
  // Return a simple JSON object for now
  return "{\"error\":\"Not implemented in this build configuration\"}";
}

} // namespace react
} // namespace facebook
