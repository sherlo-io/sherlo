/**
 * THE PURE WALK OF ONE FIBER GENERATION - no JSX, no React runtime needed to run it, so a test can
 * import it as a plain value (see MetadataProvider.tsx, which wires this to the app's own fiber tree
 * through its-fine, and captureTransport.test.ts, which drives it on a hand-built fiber directly).
 */
import { primitiveOfHostType } from '../../../componentNames';
import { isNetworkImageComponent } from './networkImageDetection';

export type ViewProps = {
  [nativeTag: number]: {
    className?: string;
    style?: any;
    testID?: string;
    hasNetworkImage?: boolean;
    /** The words this view's own fiber draws, when it draws any - see wordsInChildren. */
    text?: string;
    /** A `TextInput`'s own placeholder, kept only for the fiber that carries one. */
    placeholder?: string;
    /** A `Text`'s own numberOfLines, kept only for the fiber that carries one. */
    numberOfLines?: number;
    /** A view's own accessibilityLabel - the only words an icon or image with no Text has. */
    accessibilityLabel?: string;
  };
};

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
 * Every word a fiber's own `children` prop draws, in order: a string is a word, a number is a word
 * spelled the way React draws it (its digits, `String(n)`), an array is walked, and a React element
 * is entered through its own `props.children`. That last case is what a nested text span is -
 * `<Text>Hello <Text>World</Text></Text>` has no native view of its own (see the `text` field on
 * captureTransport.ts's CapturedViewTree), so its words never show up as a child NODE for
 * captureViewTree to fold in - they only ever reach the record by being walked here, into the outer
 * Text fiber's own words. `true`, `false`, `null` and `undefined` draw nothing and are skipped, the
 * same as React itself draws them.
 */
export function wordsInChildren(children: unknown, words: string[]): void {
  if (typeof children === 'string') {
    words.push(children);
    return;
  }

  if (typeof children === 'number') {
    words.push(String(children));
    return;
  }

  if (Array.isArray(children)) {
    children.forEach((child) => wordsInChildren(child, words));
    return;
  }

  if (children && typeof children === 'object' && 'props' in children) {
    wordsInChildren((children as { props?: { children?: unknown } }).props?.children, words);
  }
}

/**
 * Whether a host fiber's own type is one that DRAWS its `children` prop as words on screen - `Text`
 * or its nested-span sibling `VirtualText` - rather than one that merely PASSES `children` down to
 * the elements it lays out. A `View`'s `children` prop is exactly the elements of its child views,
 * and a `ScrollView`'s or an `Image`'s are no different - walking `wordsInChildren` on any of them
 * would harvest the words of views that already carry their own, as if the container had drawn them
 * itself. Only a fiber this returns true for is ever handed to wordsInChildren (see collectFromRoot).
 */
export function hostDrawsItsOwnChildrenAsWords(type: unknown): boolean {
  if (typeof type !== 'string') return false;
  const primitive = primitiveOfHostType(type);
  return primitive === 'Text' || primitive === 'VirtualText';
}

/**
 * As much of a fiber as walking one generation reads - a structural subset of its-fine's own
 * `Fiber`, so a test can build one by hand (see collectFromRoot) without satisfying every field
 * react-reconciler's own type carries. Every real `Fiber` its-fine hands back already has these.
 */
export type WalkedFiber = {
  pendingProps: any;
  memoizedProps: any;
  stateNode?: any;
  type: any;
  child?: WalkedFiber | null;
  sibling?: WalkedFiber | null;
};

/**
 * Walk one fiber generation - a `fiber` its-fine handed back, or its `.alternate` - collecting the
 * same two readings `collectMetadata` merges: every view by its native tag, and every string found
 * in props anywhere in the generation.
 *
 * EXPORTED FOR TESTS, so the words-belong-to-texts rule is exercised through this real walk on a
 * hand-built fiber tree, rather than asserted against a metadata reading typed in by hand (see
 * captureTransport.test.ts's "a text view carries the words it draws").
 */
export function collectFromRoot(root: WalkedFiber): { viewProps: ViewProps; texts: string[] } {
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
      // Words are collected only for a fiber that DRAWS its children as words - a Text or a nested
      // VirtualText span - never for a View, a ScrollView, an Image, or anything else that merely
      // lays its children out. A container's `children` prop is exactly the elements of its child
      // views, so walking wordsInChildren on it would harvest THEIR words as the container's own -
      // every word beneath it, run together, on a view that draws none itself. For a Text, entering
      // a nested element IS right: a nested Text has no native view of its own (see wordsInChildren).
      const words: string[] = [];
      if (hostDrawsItsOwnChildrenAsWords(type)) {
        wordsInChildren(pendingProps.children, words);
      }

      viewProps[nativeTag] = {
        style: pendingProps.style,
        testID: pendingProps.testID,
        className: type || undefined,
        hasNetworkImage: isNetworkImageComponent(currentFiber),
        ...(words.length > 0 && { text: words.join('') }),
        ...(typeof pendingProps.placeholder === 'string' && {
          placeholder: pendingProps.placeholder,
        }),
        ...(typeof pendingProps.numberOfLines === 'number' && {
          numberOfLines: pendingProps.numberOfLines,
        }),
        ...(typeof pendingProps.accessibilityLabel === 'string' && {
          accessibilityLabel: pendingProps.accessibilityLabel,
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
