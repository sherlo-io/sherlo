import { InspectorData, InspectorDataNode } from '../../../../types';
import { Metadata } from '../MetadataProvider';

/**
 * Enhances inspectorData with properties from fabricMetadata
 * by matching id values with fabricMetadata keys.
 * If a node with testID matching storyId is found, sets viewHierarchy
 * to point to the first child of that node.
 */
export function prepareInspectorData(
  inspectorData: InspectorData,
  fabricMetadata: Metadata,
  storyId: string
): InspectorData {
  const { density } = inspectorData;

  const inspectorDataCopy = JSON.parse(JSON.stringify(inspectorData)) as InspectorData;

  let rootStoryNode: InspectorDataNode | null = null;

  function enhanceNode(node: InspectorDataNode): void {
    if (!node) return;

    node.adjustedWidth = Math.round(node.width / density);
    node.adjustedHeight = Math.round(node.height / density);

    const metadataEntry = fabricMetadata.viewProps[node.id];

    if (metadataEntry) {
      const { className, ...properties } = metadataEntry;

      // className coming from native side can be obfuscated so if we have
      // access to the name from fiber we will use that instead
      if (className) {
        node.className = className;
      }

      node.properties = properties;

      // we need to find the root story node that will be the first node user can inspect
      // this is done to remove all boilerplate parent nodes from the hierarchy
      // like the ones injected by Sherlo
      if (node.properties.testID === storyId) {
        if (node.children && Array.isArray(node.children) && node.children.length > 0) {
          rootStoryNode = node.children[0];
        }
      }
    }

    if (node.children && Array.isArray(node.children)) {
      node.children.forEach(enhanceNode);
    }
  }

  if (inspectorDataCopy.viewHierarchy) {
    enhanceNode(inspectorDataCopy.viewHierarchy);

    if (rootStoryNode) {
      inspectorDataCopy.viewHierarchy = rootStoryNode;
    }
  }

  return inspectorDataCopy;
}
