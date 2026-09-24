import React, {
  ReactNode,
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
} from 'react';
import { FiberProvider, useFiber, type Fiber } from 'its-fine';
import { RunnerBridge } from '../../../helpers';
import { rememberAppMetadataCollector } from '../../../appMetadata';
import { isNetworkImageComponent } from './networkImageDetection';

export type ViewProps = {
  [nativeTag: number]: {
    className?: string;
    style?: any;
    testID?: string;
    hasNetworkImage?: boolean;
    /** The words this view's own fiber draws, when it draws any - see extractTextFromProps. */
    text?: string;
    /** A `TextInput`'s own placeholder, kept only for the fiber that carries one. */
    placeholder?: string;
    /** A `Text`'s own numberOfLines, kept only for the fiber that carries one. */
    numberOfLines?: number;
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
      // Only the words THIS fiber's own children prop carries - not its descendants'. A nested
      // text span is a fiber of its own, reached by this same walk under its own native tag, and
      // captureViewTree is what folds a span's words into the text of the view that holds it.
      const ownWords: string[] = [];
      extractTextFromProps(pendingProps, ownWords);

      viewProps[nativeTag] = {
        style: pendingProps.style,
        testID: pendingProps.testID,
        className: type || undefined,
        hasNetworkImage: isNetworkImageComponent(currentFiber),
        ...(ownWords.length > 0 && { text: ownWords.join('') }),
        ...(typeof pendingProps.placeholder === 'string' && {
          placeholder: pendingProps.placeholder,
        }),
        ...(typeof pendingProps.numberOfLines === 'number' && {
          numberOfLines: pendingProps.numberOfLines,
        }),
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
    // PUBLISHED FROM THE RENDER BODY, NOT AN EFFECT OF EITHER KIND - useLayoutEffect still lost the
    // race it was moved here to close, because this component is the PARENT of the story Storybook
    // renders below it (<MetadataProvider><Storybook /></MetadataProvider>, see TestingMode.tsx), and
    // React runs a child's effects - layout or passive - before its parent's, always. Whatever inside
    // Storybook's own tree fires "story rendered" is a descendant, so it was always going to finish
    // first regardless of which effect hook this used. A capture's FIRST story of a boot lost that
    // race (what root.reason.cause called 'no-metadata' at the time - a single cause since split
    // into 'nothing-published' and 'story-unnamed', see captureTransport.ts's WindowReason); every
    // capture after it never raced anything, because this component was already mounted by the
    // previous story.
    //
    // Publishing here, before `children` (Storybook, the story below it) is returned, moves this
    // ahead of the whole subtree's RENDER, not merely ahead of its effects - nothing below this line
    // has even started rendering yet, so nothing racing this can observe the reading unset.
    // (TestingMode.tsx uses the same render-body technique, for the same reason, to install a story's
    // mocks before Storybook mounts it.) `fiber` above is already resolved at this point - its-fine's
    // useFiber searches the fiber tree inside a useMemo, which runs during render - and
    // collectMetadata walks the live tree when CALLED, not when published, so it is safe to publish
    // immediately and still answers correctly for children that render later in this same commit.
    // Only the withdrawal on unmount needs an effect - there is no render-phase hook for "gone".
    //
    // THIS CLOSED THE RACE IT NAMES, BUT THE FIRST STORY OF A BOOT STILL MISSES ITS OWN METADATA. A
    // later, real-device measurement found `cause: 'story-unnamed'` for the first story - a reading
    // published and answering seconds before the metadata poll even started, never naming it - which
    // is not this race (a lost race against an effect looks like nothing published yet, not like a
    // reading that has existed for seconds). A fiber-reconciler experiment built to check the leading
    // theory here (that `fiber`/`fiber.alternate` go stale across the async gap between a placeholder
    // render and the story's real, keyed view mounting under it) did NOT reproduce the miss - the
    // pair kept tracking the live tree correctly across that exact transition. What actually
    // withholds this one story's testID from the merged reading is still unmeasured; do not re-move
    // this publish call on the strength of the reasoning above alone.
    rememberAppMetadataCollector(collectMetadata);
    useLayoutEffect(() => () => rememberAppMetadataCollector(undefined), []);

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
