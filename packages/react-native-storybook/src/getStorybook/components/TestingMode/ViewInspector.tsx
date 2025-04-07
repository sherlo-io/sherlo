import React, { forwardRef, useImperativeHandle, useRef, PropsWithChildren } from 'react';
import { findNodeHandle, StyleSheet, View } from 'react-native';

type InspectorNode = {
  key: string | null;
  type: string;
  props: Record<string, any>;
  style: Record<string, any> | null;
  path: string[];
  children: InspectorNode[];
};

export type ViewInspectorRef = {
  getJSInspectorData: () => InspectorNode | null;
};

export const ViewInspector = forwardRef<ViewInspectorRef, PropsWithChildren>(
  ({ children }, ref) => {
    const rootRef = useRef(null);

    useImperativeHandle(ref, () => ({
      getJSInspectorData() {
        const fiber = (rootRef.current as any)?._reactInternals;
        if (!fiber) return null;
        return collectFiberTree(fiber);
      },
    }));

    return (
      <View style={StyleSheet.absoluteFill} ref={rootRef}>
        {children}
      </View>
    );
  }
);

function collectFiberTree(fiberNode: any, path: string[] = []): InspectorNode {
  if (!fiberNode) return null as any;

  const type =
    fiberNode.type?.name ||
    fiberNode.elementType?.name ||
    fiberNode.elementType ||
    fiberNode.type ||
    'Unknown';

  const props = fiberNode.memoizedProps || {};
  const style = props.style ? StyleSheet.flatten(props.style) : null;

  const node: InspectorNode = {
    key: fiberNode.key ?? null,
    type: typeof type === 'string' ? type : 'Anonymous',
    props,
    style,
    path,
    children: [],
  };

  if (fiberNode.child) {
    let child = fiberNode.child;
    let index = 0;
    while (child) {
      const childNode = collectFiberTree(child, [...path, `child[${index}]`]);
      if (childNode) {
        node.children.push(childNode);
      }
      child = child.sibling;
      index++;
    }
  }

  return node;
}
