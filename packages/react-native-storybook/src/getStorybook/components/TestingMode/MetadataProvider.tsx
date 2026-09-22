import React, { ReactNode, forwardRef, useCallback, useEffect, useImperativeHandle } from 'react';
import { FiberProvider, useFiber } from 'its-fine';
import { RunnerBridge } from '../../../helpers';
import { publishAppMetadata } from '../../../appMetadata';
import { isNetworkImageComponent } from './networkImageDetection';

export interface Metadata {
  viewProps: {
    [nativeTag: number]: {
      className?: string;
      style?: any;
      testID?: string;
      hasNetworkImage?: boolean;
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

    const collectMetadata = useCallback((): Metadata => {
      if (!fiber) {
        RunnerBridge.log('No fiber node available.');
        return {
          viewProps: {},
          texts: [],
        };
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

        const { pendingProps, stateNode, memoizedProps, type } = currentFiber;

        // In new architecture, the native tag is on the canonical fiber
        const nativeTag = stateNode?._nativeTag || stateNode?.canonical?.nativeTag;

        // Collect view props with native tags
        if (nativeTag) {
          metadata.viewProps[nativeTag] = {
            style: pendingProps.style,
            testID: pendingProps.testID,
            className: type || undefined,
            hasNetworkImage: isNetworkImageComponent(currentFiber),
          };
        }

        // Extract text from props
        extractTextFromProps(pendingProps, metadata.texts);
        extractTextFromProps(memoizedProps, metadata.texts);

        if (currentFiber.child) queue.push(currentFiber.child);
        if (currentFiber.sibling) queue.push(currentFiber.sibling);
      }

      // Remove duplicates
      metadata.texts = [...new Set(metadata.texts)];

      return metadata;
    }, [fiber]);

    useImperativeHandle(ref, () => ({ collectMetadata }), [collectMetadata]);

    // A capture is plain JavaScript outside the renderer and holds no ref, so the reading is
    // published where it can find it (../../../appMetadata) for as long as the app is rendered.
    useEffect(() => publishAppMetadata(collectMetadata), [collectMetadata]);

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
