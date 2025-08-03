import React, { ReactNode, forwardRef, useImperativeHandle } from 'react';
import { FiberProvider, useFiber } from 'its-fine';
import { RunnerBridge } from '../../../helpers';

export interface Metadata {
  viewProps: {
    [nativeTag: number]: {
      className?: string;
      style?: any;
      testID?: string;
      hasRemoteImage?: boolean;
    };
  };
  texts: string[];
}

export interface MetadataProviderRef {
  collectMetadata: () => Metadata;
}

const REMOTE_IMAGE_COMPONENTS = new Set([
  'ReactImageView', // RN iOS
  'RCTImageView', // RN Android
  'FFFastImageView', // FastImage iOS
  'FastImageView', // FastImage Android
  'SDAnimatedImageView', // ExpoImage iOS
  'ExpoImageView', // ExpoImage Android
  'TurboImageView', // TurboImage iOS
  'TurboImageView', // TurboImage Android
]);

// const REMOVE_VIDEO_COMPONENTS = new Set([
//   'ReactVideo', // RN iOS
//   'RCTVideo', // RN Android
//   'ExpoVideo', // ExpoVideo iOS
//   'ExpoVideo', // ExpoVideo Android
// ]);

function isRemoteImageSourceFilter(uri: string): boolean {
  if (!uri || typeof uri !== 'string') return false;
  return uri.startsWith('http') && !uri.includes('://192.168.');
}

function isRemoteImageSource(source: any): boolean {
  if (!source) return false;

  if (Array.isArray(source)) {
    return source.some(isRemoteImageSource);
  }

  if (typeof source === 'string') {
    return isRemoteImageSourceFilter(source);
  }

  if (typeof source === 'object') {
    return isRemoteImageSourceFilter(source.uri);
  }

  return false;
}

function isRemoteImageComponent(fiber: any): boolean {
  const { type, pendingProps, memoizedProps } = fiber;
  const componentName = typeof type === 'string' ? type : type?.displayName || type?.name;
  if (!componentName || !REMOTE_IMAGE_COMPONENTS.has(componentName)) return false;

  const props = pendingProps || memoizedProps;
  if (!props) return false;

  const source = props.source || props.src || props.srcSet || props.svgXmlData;
  return isRemoteImageSource(source);
}

const MetadataCollector = forwardRef<MetadataProviderRef, { children: ReactNode }>(
  ({ children }, ref) => {
    const fiber = useFiber();

    useImperativeHandle(ref, () => ({
      collectMetadata: () => {
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
              hasRemoteImage: isRemoteImageComponent(currentFiber),
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
