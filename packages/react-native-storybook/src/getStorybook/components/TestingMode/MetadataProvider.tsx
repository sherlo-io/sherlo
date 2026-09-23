import React, {
  ReactNode,
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
} from 'react';
import { FiberProvider, useFiber, type Fiber } from 'its-fine';
import { RunnerBridge } from '../../../helpers';
import { publishAppMetadata } from '../../../appMetadata';
import { isNetworkImageComponent } from './networkImageDetection';

export type ViewProps = {
  [nativeTag: number]: {
    className?: string;
    style?: any;
    testID?: string;
    hasNetworkImage?: boolean;
  };
};

export interface Metadata {
  viewProps: ViewProps;
  texts: string[];
  /**
   * The same reading above, kept SEPARATE per fiber generation this collector walked - `fiber`
   * and its `.alternate` (see the comment on `roots` in `collectMetadata`). `viewProps`/`texts`
   * are the two MERGED across every generation, which is right for "what does the app's views
   * look like" - a view's own native tag is never reused across a story switch, so a stale
   * generation can only ADD harmless extra entries for views no longer mounted, never overwrite
   * a live one. It is NOT right for "is the story ON SCREEN NOW throwing": a story that threw a
   * switch or two ago left its fallback text sitting in the merged reading forever, under no tag
   * a live inspector reading will ever match again. A caller asking that question reads this
   * instead, picking the one generation whose own testID-carrying view is still live.
   */
  generations: { viewProps: ViewProps; texts: string[] }[];
}

/** Extract every string found in a fiber's props, straight or nested one level under `children`. */
function extractTextFromProps(props: any, texts: string[]): void {
  if (!props) return;

  if (typeof props === 'string') {
    texts.push(props);
    return;
  }

  if (typeof props === 'object') {
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

/**
 * Walk one fiber generation - a `fiber` its-fine handed back, or its `.alternate` - collecting the
 * same two readings `collectMetadata` merges: every view by its native tag, and every string found
 * in props anywhere in the generation.
 */
function collectFromRoot(root: Fiber): { viewProps: ViewProps; texts: string[] } {
  const viewProps: ViewProps = {};
  const texts: string[] = [];
  const visited = new Set();
  const queue = [root];

  while (queue.length > 0) {
    const currentFiber = queue.shift();
    if (!currentFiber || visited.has(currentFiber)) continue;
    visited.add(currentFiber);

    const { pendingProps, stateNode, memoizedProps, type } = currentFiber;

    // In new architecture, the native tag is on the canonical fiber
    const nativeTag = stateNode?._nativeTag || stateNode?.canonical?.nativeTag;

    if (nativeTag) {
      viewProps[nativeTag] = {
        style: pendingProps.style,
        testID: pendingProps.testID,
        className: type || undefined,
        hasNetworkImage: isNetworkImageComponent(currentFiber),
      };
    }

    extractTextFromProps(pendingProps, texts);
    extractTextFromProps(memoizedProps, texts);

    if (currentFiber.child) queue.push(currentFiber.child);
    if (currentFiber.sibling) queue.push(currentFiber.sibling);
  }

  return { viewProps, texts };
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
        return { viewProps: {}, texts: [], generations: [] };
      }

      // `fiber` is captured once, at this component's own first render, and stays fixed for the
      // app's lifetime - its-fine's useFiber() has no cheap way to say which of a fiber and its
      // `.alternate` React currently shows (see its own [e, e.alternate] search), so both have to
      // be walked to be sure whichever one is current is among them. Kept as separate generations
      // rather than one combined walk, because a reader asking "is the story on screen right now
      // broken" needs to know which generation a fact came from - see `Metadata.generations`.
      const roots = [fiber, fiber.alternate].filter((root): root is Fiber => !!root);
      const generations = roots.map(collectFromRoot);

      const metadata: Metadata = { viewProps: {}, texts: [], generations };
      for (const generation of generations) {
        Object.assign(metadata.viewProps, generation.viewProps);
        metadata.texts.push(...generation.texts);
      }
      metadata.texts = [...new Set(metadata.texts)];

      return metadata;
    }, [fiber]);

    useImperativeHandle(ref, () => ({ collectMetadata }), [collectMetadata]);

    // A capture is plain JavaScript outside the renderer and holds no ref, so the reading is
    // published where it can find it (../../../appMetadata) for as long as the app is rendered.
    //
    // PUBLISHED FROM useLayoutEffect, NOT useEffect - a capture's FIRST story of a boot raced this
    // against Storybook's own "story rendered" signal and lost (root.reason.cause: 'no-metadata' on
    // that first capture, never on the ones after - see captureTransport.ts's metadataOfTheApp).
    // React 18 defers a passive effect's FIRST run to a task the Scheduler queues after the commit,
    // even for the initial mount; a layout effect has no such queue; it runs synchronously inside the
    // same commit that mounted this component, before control ever returns to whatever is racing it.
    // Storybook's own phase machine emits "story rendered" once its story has mounted, which is a
    // commit at or below this one - so a layout effect here is guaranteed to have already published
    // by the time that signal can possibly fire, where a passive effect was only ever going to be
    // usually early enough. Every capture after the first was never actually racing anything (this
    // component mounted once, long before): this only changes when the ONE publish that was ever
    // late enough to matter runs.
    useLayoutEffect(() => publishAppMetadata(collectMetadata), [collectMetadata]);

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
