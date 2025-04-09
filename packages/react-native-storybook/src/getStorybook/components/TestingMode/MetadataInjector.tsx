import React, { ReactElement, ReactNode, cloneElement, isValidElement } from 'react';

// -----------------------------------------------------------------------------
// Constants and Setup
// -----------------------------------------------------------------------------

// Toggle verbose logs (set to true for debugging)
const SHOW_LOGS = true;
const log = (msg: string, ...args: any[]) => SHOW_LOGS && console.log(msg, ...args);
const warn = (msg: string, ...args: any[]) => SHOW_LOGS && console.warn(msg, ...args);

// Initialize global metadata store
let counter = 1;
const store: Record<string, any> = {};
(global as any).__SHERLO_METADATA__ = store;

// React symbols for component types
const MEMO_TYPE = Symbol.for('react.memo');
const FORWARD_REF_TYPE = Symbol.for('react.forward_ref');

// -----------------------------------------------------------------------------
// Type Definitions and Guards
// -----------------------------------------------------------------------------

interface ForwardRefType {
  $$typeof: symbol;
  render?: (props: any, ref: any) => ReactNode;
}

interface MemoType {
  $$typeof: symbol;
  type?: (props: any) => ReactNode;
}

type ComponentWithDisplayName = {
  displayName?: string;
  name?: string;
};

/**
 * Type guard to check if a type is a ForwardRef
 */
function isForwardRef(type: any): type is ForwardRefType {
  return type && typeof type === 'object' && type.$$typeof === FORWARD_REF_TYPE;
}

/**
 * Type guard to check if a type is a memo component
 */
function isMemoComponent(type: any): type is MemoType {
  return type && typeof type === 'object' && type.$$typeof === MEMO_TYPE;
}

// -----------------------------------------------------------------------------
// Display and Logging Utilities
// -----------------------------------------------------------------------------

/**
 * Get component name safely
 */
function getComponentName(type: any): string {
  if (typeof type === 'function') {
    const component = type as ComponentWithDisplayName;
    return component.displayName || component.name || '';
  }
  if (typeof type === 'object' && type !== null) {
    const component = type as ComponentWithDisplayName;
    return component.displayName || component.name || '';
  }
  return '';
}

// -----------------------------------------------------------------------------
// Component Unwrapping
// -----------------------------------------------------------------------------

/**
 * Unwrap the element if it is a forwardRef or memo
 */
function unwrapComponent(element: ReactElement, depth: number): ReactNode {
  if (isValidElement(element)) {
    const { type, props } = element;

    if (isForwardRef(type)) {
      log(`${'  '.repeat(depth)}Unwrapping forwardRef`);
      const unwrapped = unwrapForwardRef(type, props, depth);
      if (unwrapped !== null) {
        return unwrapped;
      }
      log(`${'  '.repeat(depth)}Unwrapped forwardRef was null`);
    } else if (isMemoComponent(type)) {
      log(`${'  '.repeat(depth)}Unwrapping memo`);
      const unwrapped = unwrapMemo(type, props, depth);
      if (unwrapped !== null) {
        return unwrapped;
      }
      log(`${'  '.repeat(depth)}Unwrapped memo was null`);
    } else {
      log(`${'  '.repeat(depth)}No unwrapping needed`);
    }
  }

  return element;
}

/**
 * Unwrap a forwardRef component
 */
function unwrapForwardRef(type: ForwardRefType, props: any, depth: number): ReactNode | null {
  if (typeof type.render !== 'function') {
    warn(
      `${'  '.repeat(
        depth
      )}⚠️ ForwardRef detected but render is not a function. Aborting unwrapping.`
    );
    return null;
  }

  try {
    const unwrapped = type.render(props, null);

    if (!isValidElement(unwrapped)) {
      warn(
        `${'  '.repeat(
          depth
        )}⚠️ Unwrapped forwardRef result is not a valid React element. Aborting.`
      );
      return null;
    }

    return unwrapped;
  } catch (e) {
    warn(`${'  '.repeat(depth)}⚠️ Exception while unwrapping forwardRef:`, e);
    return null;
  }
}

/**
 * Unwrap a memo component
 */
function unwrapMemo(type: MemoType, props: any, depth: number): ReactNode | null {
  if (typeof type.type !== 'function') {
    warn(`${'  '.repeat(depth)}⚠️ Memo detected but type is not a function. Aborting unwrapping.`);
    return null;
  }

  try {
    const unwrapped = type.type(props);
    log(`${'  '.repeat(depth)}Result of memo unwrapping:`, unwrapped);

    if (!isValidElement(unwrapped)) {
      warn(`${'  '.repeat(depth)}⚠️ Unwrapped memo result is not a valid React element. Aborting.`);
      return null;
    }

    return unwrapped;
  } catch (e) {
    warn(`${'  '.repeat(depth)}⚠️ Exception while unwrapping memo:`, e);
    return null;
  }
}

// -----------------------------------------------------------------------------
// Metadata Injection
// -----------------------------------------------------------------------------

/**
 * Process a primitive element by injecting metadata
 */
function storeMetadataAndCloneElementWithNativeID(
  element: ReactElement,
  depth: number
): ReactElement {
  const { props } = element;
  const id = `sherlo-${counter++}`;
  const nativeID = props.nativeID ?? id;

  // Store metadata
  store[nativeID] = {
    style: props?.style,
    testID: props?.testID,
    nativeID,
  };

  log(`${'  '.repeat(depth)}✅ Injected metadata for ${nativeID}`);

  return cloneElement(element, { ...props, nativeID }, props.children);
}

/**
 * Process children by mapping through them and injecting metadata
 */
function processChildren(children: any, depth: number): any {
  if (typeof children === 'function') {
    return (...args: any[]) =>
      React.Children.map(children(...args), (child) => injectMetadata(child, depth));
  }

  return React.Children.map(children, (child) => injectMetadata(child, depth));
}

/**
 * Check if node is a valid React element for processing
 */
function isReactElement(element: ReactNode, depth: number): boolean {
  if (typeof element !== 'object' || element === null) {
    log(`${'  '.repeat(depth)}Encountered primitive:`, element);
    return false;
  }

  if (!isValidElement(element)) {
    log(`${'  '.repeat(depth)}⛔️ Not a valid React element:`, element);
    return false;
  }

  return true;
}

/**
 * Handle unresolved memo components
 */
function handleUnresolvedMemo(type: MemoType, props: any, depth: number): ReactNode {
  if (typeof type.type !== 'function') {
    warn(`${'  '.repeat(depth)}⚠️ Underlying memo type is not a function. Skipping this element.`);
    return props.children;
  }

  const WrappedComponent = () =>
    renderAndProcessComponent(type.type as React.ComponentType<any>, props, depth);

  return <WrappedComponent />;
}

/**
 * Render and process a function component
 */
function renderAndProcessComponent<P>(
  type: React.ComponentType<P>,
  props: P,
  depth: number
): ReactNode {
  try {
    let rendered: ReactNode;
    if (type.prototype?.isReactComponent) {
      // Class component
      const ClassComponent = type as React.ComponentClass<P>;
      const instance = new ClassComponent(props);
      rendered = instance.render();
      log(`${'  '.repeat(depth)}Class component rendered:`, rendered);
    } else {
      // Function component
      const FunctionComponent = type as React.FC<P>;
      rendered = FunctionComponent(props);
      log(`${'  '.repeat(depth)}Function component rendered:`, rendered);
    }

    return injectMetadata(rendered, depth + 1);
  } catch (e) {
    warn(`${'  '.repeat(depth)}⚠️ Failed to render component`, e);
    return null;
  }
}

/**
 * Recursively traverse the React element tree to inject metadata
 */
function injectMetadata(reactNode: ReactNode, depth = 0): ReactNode {
  if (!isReactElement(reactNode, depth)) {
    return reactNode;
  }

  let reactElement = reactNode as ReactElement;
  const { type, props } = reactElement;

  if (props.style !== undefined) {
    reactElement = storeMetadataAndCloneElementWithNativeID(reactElement, depth);
  }

  log(
    `${'  '.repeat(depth)}🔥 processing "${getComponentName(type)}" that ${
      props.style !== undefined ? 'CONTAINS style props' : 'DOES NOT CONTAIN style props'
    }`,
    reactElement
  );

  // Try to unwrap the component
  const unwrapped = unwrapComponent(reactElement, depth);

  if (unwrapped !== reactElement) {
    log(`${'  '.repeat(depth)}Element unwrapped. Processing the unwrapped element.`, unwrapped);
    return injectMetadata(unwrapped, depth);
  }

  // Handle unresolved memo components
  if (isMemoComponent(type)) {
    log(`${'  '.repeat(depth)}⚠️ Unresolved memo detected. Wrapping with HOC.`);
    return handleUnresolvedMemo(type, props, depth);
  }

  if (props?.children) {
    log(
      `${'  '.repeat(depth)}📦 Element with children, processing ${
        props.children?.length ?? 0
      } children`
    );
    const children = processChildren(props.children, depth + 1);
    return cloneElement(reactElement, props, children);
  }

  if (typeof type === 'function') {
    log(`${'  '.repeat(depth)}Rendering component:`, type);
    return renderAndProcessComponent(type, props, depth);
  }

  log(`${'  '.repeat(depth)}❓ Unknown element type, skipping metadata injection.`);

  return reactElement;
}

/**
 * MetadataInjector:
 *
 * This testing-only component recursively traverses the React element tree,
 * attempting to unwrap forwardRef and memoized components and inject metadata
 * (such as styles, testID, nativeID) into a global store.
 *
 * It includes special handling for context-related elements and for FlatList,
 * ensuring that each FlatList item's renderItem output is processed only once.
 */
export function MetadataInjector({ children }: { children: ReactNode }): ReactNode {
  log(`MetadataInjector`);
  return injectMetadata(children);
}
