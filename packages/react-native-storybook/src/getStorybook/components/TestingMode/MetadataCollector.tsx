import React, { useRef, useImperativeHandle, forwardRef, useEffect } from 'react';
import { View, findNodeHandle } from 'react-native';

type CollectedProps = {
  style?: any;
  testID?: string;
  nativeID?: string;
  name: string;
};

export type MetadataMap = Record<number, CollectedProps>;

export type MetadataCollectorRef = {
  collectMetadata: () => MetadataMap;
};

const MetadataCollector = forwardRef<MetadataCollectorRef, { children: React.ReactNode }>(
  ({ children }, ref) => {
    const rootRef = useRef<View>(null);

    const collectMetadata = (): MetadataMap => {
      const instance = rootRef.current as any;
      const fiberNode = instance?._internalFiberInstanceHandleDEV;

      if (!fiberNode) {
        console.warn('[MetadataCollector] ❌ No fiber node found');
        return {};
      }

      console.log('[MetadataCollector] ✅ Starting metadata collection');
      const map: MetadataMap = {};
      traverseFiberTree(fiberNode, map);
      console.log('[MetadataCollector] ✅ Metadata map:', map);
      return map;
    };

    useImperativeHandle(ref, () => ({
      collectMetadata,
    }));

    return (
      <View ref={rootRef} collapsable={false} style={{ flex: 1 }}>
        {children}
      </View>
    );
  }
);

function traverseFiberTree(fiber: any, map: MetadataMap) {
  if (!fiber) return;

  const nativeTag = findNativeTag(fiber);
  if (nativeTag != null) {
    const name = getComponentName(fiber);
    const props = fiber.memoizedProps || {};
    const { style, testID, nativeID } = props;

    map[nativeTag] = {
      name,
      style,
      testID,
      nativeID,
    };
  }

  traverseFiberTree(fiber.child, map);
  traverseFiberTree(fiber.sibling, map);
}

function getComponentName(fiber: any): string {
  if (typeof fiber.type === 'string') return fiber.type;
  if (typeof fiber.type === 'function') return fiber.type.name || 'Anonymous';
  if (typeof fiber.elementType === 'string') return fiber.elementType;
  return 'Unknown';
}

function findNativeTag(fiber: any): number | null {
  try {
    return findNodeHandle(fiber.stateNode);
  } catch {
    return null;
  }
}

export default MetadataCollector;
