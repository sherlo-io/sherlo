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
  let foundNodeWithFirstChild: InspectorDataNode | null = null;

  function enhanceNode(node: InspectorDataNode): void {
    if (!node) return;

    node.adjustedWidth = Math.round(node.width / density);
    node.adjustedHeight = Math.round(node.height / density);

    const metadataEntry = fabricMetadata.viewProps[node.id];

    if (metadataEntry) {
      node.properties = metadataEntry;

      if (metadataEntry.testID === storyId) {
        const nodeAny = node as any;
        if (nodeAny.children && Array.isArray(nodeAny.children) && nodeAny.children.length > 0) {
          foundNodeWithFirstChild = nodeAny.children[0];
        }
      }
    }

    const nodeAny = node as any;
    if (nodeAny.children && Array.isArray(nodeAny.children)) {
      nodeAny.children.forEach(enhanceNode);
    }
  }

  if (inspectorData.viewHierarchy) {
    enhanceNode(inspectorData.viewHierarchy);

    if (foundNodeWithFirstChild) {
      inspectorData.viewHierarchy = foundNodeWithFirstChild;
    }
  }

  return inspectorData;
}
