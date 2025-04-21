#pragma once
#include <memory>
#include <string>

// Forward‑declare ShadowNode so we don't need extra headers here
namespace facebook {
namespace react {
  class ShadowNode;
  std::shared_ptr<const ShadowNode> getRootShadowNode(int surfaceId);
  std::string serializeNodeToJson(const ShadowNode &node);
}
}
