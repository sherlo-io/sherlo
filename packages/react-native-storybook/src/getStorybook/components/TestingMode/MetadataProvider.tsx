import React, { ReactNode, forwardRef, useImperativeHandle } from 'react';
import { FiberProvider, useFiber } from 'its-fine';

const SHOW_LOGS = true;
const log = (...args: any[]) => SHOW_LOGS && console.log('[MetadataProvider]', ...args);

export interface Metadata {
  [nativeTag: number]: {
    style?: any;
    testID?: string;
  };
}

export interface MetadataProviderRef {
  collectMetadata: () => Metadata;
}

const MetadataCollector = forwardRef<MetadataProviderRef, { children: ReactNode }>(
  ({ children }, ref) => {
    const fiber = useFiber();

    useImperativeHandle(ref, () => ({
      collectMetadata: () => {
        if (!fiber) {
          log('⚠️ No fiber node available.');
          return {};
        }

        const metadata: Metadata = {};
        const visited = new Set();
        const queue = [fiber];

        while (queue.length > 0) {
          const currentFiber = queue.shift();
          if (!currentFiber || visited.has(currentFiber)) continue;
          visited.add(currentFiber);

          const { type, pendingProps, stateNode } = currentFiber;

          // @ts-expect-error
          if (stateNode && stateNode._nativeTag) {
            // @ts-expect-error
            const nativeTag = stateNode._nativeTag;
            const componentName =
              typeof type === 'function'
                ? type.displayName || type.name || 'AnonymousFunction'
                : typeof type === 'string'
                ? type
                : 'Unknown';

            log(`🎯 Found nativeTag ${nativeTag} (${componentName})`, pendingProps);

            metadata[nativeTag] = {
              style: pendingProps.style,
              testID: pendingProps.testID,
            };
          }

          if (currentFiber.child) queue.push(currentFiber.child);
          if (currentFiber.sibling) queue.push(currentFiber.sibling);
        }

        log('✅ nativeTag collection completed.', metadata);

        return metadata;
      },
    }));

    return <>{children}</>;
  }
);

export const MetadataProvider = forwardRef<MetadataProviderRef, { children: ReactNode }>(
  ({ children }, ref) => {
    return (
      <FiberProvider>
        <MetadataCollector ref={ref}>{children}</MetadataCollector>
      </FiberProvider>
    );
  }
);
