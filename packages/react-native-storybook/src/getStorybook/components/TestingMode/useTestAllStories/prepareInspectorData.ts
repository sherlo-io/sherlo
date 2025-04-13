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

    const { className, ...metadataEntry } = fabricMetadata.viewProps[node.id];

    if (className) {
      node.className = className;
    }

    if (metadataEntry) {
      node.properties = metadataEntry;

      if (node.properties.testID === storyId) {
        if (node.children && Array.isArray(node.children) && node.children.length > 0) {
          rootStoryNode = node.children[0];
        }
      }
    }

    const nodeAny = node as any;
    if (nodeAny.children && Array.isArray(nodeAny.children)) {
      nodeAny.children.forEach(enhanceNode);
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
