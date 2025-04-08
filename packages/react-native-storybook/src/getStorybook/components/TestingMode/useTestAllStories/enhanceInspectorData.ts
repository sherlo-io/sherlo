/**
 * Enhances inspectorData with jsProperties from metadataTree
 * by matching nativeTag values with metadata keys
 */
export function enhanceInspectorDataWithJsProperties(
  inspectorData: any,
  metadataTree: Record<string, any>
): any {
  if (!inspectorData || !metadataTree) {
    return inspectorData;
  }

  // Create a deep copy of inspectorData to avoid mutating the original
  const enhancedData = JSON.parse(JSON.stringify(inspectorData));

  // Helper function to recursively traverse and enhance the view hierarchy
  function enhanceNode(node: any): void {
    if (!node) return;

    // Check if there's a matching entry in metadataTree for this node
    const metadataEntry = metadataTree[node.nativeTag?.toString()];

    if (metadataEntry) {
      // Add metadata as jsProperties
      node.properties = { ...metadataEntry };
    }

    // Recursively process children
    if (Array.isArray(node.children)) {
      node.children.forEach(enhanceNode);
    }
  }

  // Start enhancing from the root of viewHierarchy
  if (enhancedData.viewHierarchy) {
    enhanceNode(enhancedData.viewHierarchy);
  }

  return enhancedData;
}
