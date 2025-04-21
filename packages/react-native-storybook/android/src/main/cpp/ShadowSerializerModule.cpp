#include "ShadowSerializerModule.h"
#include "NodeSerializer.h"
#include <string>

JNIEXPORT jstring JNICALL
Java_io_sherlo_storybookreactnative_InspectorHelper_nativeGetShadowTreeData(
    JNIEnv *env,
    jclass clazz,
    jint surfaceId) {

  // Add some logging for the surfaceId
  std::string errorMsg;
  
  if (surfaceId <= 0) {
    errorMsg = "{\"error\":\"Invalid surfaceId: " + std::to_string(surfaceId) + "\"}";
    return env->NewStringUTF(errorMsg.c_str());
  }

  auto rootNode = facebook::react::getRootShadowNode(surfaceId);
  
  // Handle the nullptr case
  if (!rootNode) {
    errorMsg = "{\"error\":\"Could not get root node for surfaceId: " + std::to_string(surfaceId) + "\"}";
    return env->NewStringUTF(errorMsg.c_str());
  }
  
  auto json = facebook::react::serializeNodeToJson(*rootNode);
  return env->NewStringUTF(json.c_str());
}
