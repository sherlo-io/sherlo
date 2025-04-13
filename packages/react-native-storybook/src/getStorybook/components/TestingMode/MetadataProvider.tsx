import React, { ReactNode, forwardRef, useImperativeHandle } from 'react';
import { FiberProvider, useFiber } from 'its-fine';
import { RunnerBridge } from '../../../helpers';

export interface Metadata {
  viewProps: {
    [nativeTag: number]: {
      style?: any;
      testID?: string;
    };
  };
  texts: string[];
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
          RunnerBridge.log('No fiber node available.');
          return { viewProps: {}, texts: [] };
        }

        const metadata: Metadata = {
          viewProps: {},
          texts: [],
        };

        const visited = new Set();
        const queue = [fiber, fiber.alternate];

        while (queue.length > 0) {
          const currentFiber = queue.shift();
          if (!currentFiber || visited.has(currentFiber)) continue;
          visited.add(currentFiber);

          const { pendingProps, stateNode, memoizedProps } = currentFiber;

          // Collect view props with native tags
          if (stateNode && stateNode._nativeTag) {
            const nativeTag = stateNode._nativeTag;

            metadata.viewProps[nativeTag] = {
              style: pendingProps.style,
              testID: pendingProps.testID,
            };
          }

          // Extract text from props
          extractTextFromProps(pendingProps, metadata.texts);
          extractTextFromProps(memoizedProps, metadata.texts);

          // Continue traversal
          if (currentFiber.child) queue.push(currentFiber.child);
          if (currentFiber.sibling) queue.push(currentFiber.sibling);
        }

        // Remove duplicates
        metadata.texts = [...new Set(metadata.texts)];

        return metadata;
      },
    }));

    // Simplified helper that focuses on children
    function extractTextFromProps(props: any, texts: string[]) {
      if (!props) return;

      // Direct string
      if (typeof props === 'string') {
        texts.push(props);
        return;
      }

      // Process object properties - focus on children
      if (typeof props === 'object') {
        // Check children
        if (props.children) {
          if (typeof props.children === 'string') {
            texts.push(props.children);
          } else if (Array.isArray(props.children)) {
            props.children.forEach((child: any) => {
              if (typeof child === 'string') {
                texts.push(child);
              }
            });
          }
        }
      }
    }

    return children;
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
