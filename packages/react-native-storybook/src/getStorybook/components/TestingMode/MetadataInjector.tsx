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
const CONTEXT_TYPE = Symbol.for('react.context');
const PROVIDER_TYPE = Symbol.for('react.provider');

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
 * Get a displayable name for logging
 */
function getDisplayType(type: any): string {
  if (typeof type === 'string') return type;
  if (typeof type === 'function') {
    const component = type as ComponentWithDisplayName;
    return component.displayName || component.name || 'anonymous';
  }
  if (typeof type === 'object' && type !== null) {
    if (type.$$typeof === FORWARD_REF_TYPE) return 'forwardRef';
    if (type.$$typeof === MEMO_TYPE) return 'memo';
    if (type.$$typeof === CONTEXT_TYPE) return 'context';
    if (type.$$typeof === PROVIDER_TYPE) return 'provider';
    return 'unknownObj';
  }
  return 'unknown';
}

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
// FlatList Processing
// -----------------------------------------------------------------------------

/**
 * Special-case FlatList: Override its props to force rendering all items
 * and wrap renderItem to process each rendered item through metadata injection
 */
function processFlatList(element: ReactElement, depth: number): ReactElement {
  const { props } = element;
  log(`${'  '.repeat(depth)}Special processing for FlatList`);

  const newElement = cloneElement(element, {
    ...props,
    renderItem: (...args: any) => {
      const itemElement = props.renderItem(...args);
      return injectMetadata(itemElement, depth + 1);
    },
  });

  return newElement;
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
    } else if (isMemoComponent(type)) {
      log(`${'  '.repeat(depth)}Unwrapping memo`);
      const unwrapped = unwrapMemo(type, props, depth);
      if (unwrapped !== null) {
        return unwrapped;
      }
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
 * HOC that wraps a component to process its output through metadata injection
 */
function withInjectedMetadata<P>(Component: React.ComponentType<P>) {
  return function MetadataInjectedComponent(props: P) {
    log(`withInjectedMetadata: Rendering component with props:`, props);

    try {
      const element = renderComponent(Component, props);
      log(`withInjectedMetadata: Rendered element:`, element);
      return injectMetadata(element);
    } catch (e) {
      warn(`withInjectedMetadata: Error rendering component:`, e);
      return <>{null}</>;
    }
  };
}

/**
 * Render a component with props
 */
function renderComponent<P>(Component: React.ComponentType<P>, props: P): ReactNode {
  if (Component.prototype && Component.prototype.isReactComponent) {
    const ClassComponent = Component as React.ComponentClass<P>;
    const instance = new ClassComponent(props);
    return instance.render();
  } else {
    const FunctionComponent = Component as React.FC<P>;
    return FunctionComponent(props);
  }
}

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
 * Recursively traverse the React element tree to inject metadata
 */
function injectMetadata(reactNode: ReactNode, depth = 0): ReactNode {
  if (!isReactElement(reactNode, depth)) {
    return reactNode;
  }

  let reactElement = reactNode as ReactElement;
  const { type, props } = reactElement;
  const compName = getComponentName(type);

  if (props.style !== undefined) {
    reactElement = storeMetadataAndCloneElementWithNativeID(reactElement, depth);
  }

  log(
    `${'  '.repeat(depth)}🔥 processing "${compName}" of type ${getDisplayType(type)} that ${
      props.style !== undefined ? 'CONTAINS style props' : 'DOES NOT CONTAIN style props'
    }`
  );
  log(`${'  '.repeat(depth)}reactElement:`, reactElement);

  // Special handling for FlatList
  if (compName === 'FlatList') {
    return processFlatList(reactElement, depth);
  }

  // Try to unwrap the component
  const unwrapped = unwrapComponent(reactElement, depth);
  log(`${'  '.repeat(depth)}unwrapped:`, unwrapped);

  if (unwrapped !== reactElement) {
    log(`${'  '.repeat(depth)}Element unwrapped. Processing the unwrapped element.`);
    return injectMetadata(unwrapped, depth);
  }

  // Log element information
  const displayType = getDisplayType(type);
  log(`${'  '.repeat(depth)}🔍 Visiting element: { type: ${displayType} }`);

  // Handle different component types
  return processElementByType(reactElement, depth);
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
 * Process an element based on its type
 */
function processElementByType(element: ReactElement, depth: number): ReactNode {
  const { type, props } = element;

  // Handle unresolved memo components
  if (isMemoComponent(type)) {
    log(`${'  '.repeat(depth)}⚠️ Unresolved memo detected. Wrapping with HOC.`);
    return handleUnresolvedMemo(type, props, depth);
  }

  // Handle React.Fragment
  if (type === React.Fragment) {
    log(`${'  '.repeat(depth)}📦 Fragment: ${getDisplayType(type)}, processing children`);
    const children = processChildren(props.children, depth + 1);
    return cloneElement(element, {}, children);
  }

  // Handle class components
  if (typeof type === 'function' && type.prototype?.isReactComponent) {
    log(`${'  '.repeat(depth)}📦 Class component: ${getDisplayType(type)}, processing children`);
    const children = processChildren(props.children, depth + 1);
    return cloneElement(element, props, children);
  }

  // Handle function components
  if (typeof type === 'function') {
    log(`${'  '.repeat(depth)}📦 Function component: ${getDisplayType(type)}, processing children`);
    return renderAndProcessFunctionComponent(type, props, depth);
  }

  // Handle elements with children
  if (props?.children) {
    log(
      `${'  '.repeat(depth)}📦 Element with children: ${getDisplayType(type)}, processing children`
    );
    const children = processChildren(props.children, depth + 1);
    return cloneElement(element, props, children);
  }

  log(`${'  '.repeat(depth)}❓ Unknown element type, skipping metadata injection.`);
  return element;
}

/**
 * Handle unresolved memo components
 */
function handleUnresolvedMemo(type: MemoType, props: any, depth: number): ReactNode {
  if (typeof type.type !== 'function') {
    warn(`${'  '.repeat(depth)}⚠️ Underlying memo type is not a function. Skipping this element.`);
    return <>{props.children}</>;
  }

  const WrappedComponent = withInjectedMetadata(type.type);
  return <WrappedComponent {...props} />;
}

/**
 * Render and process a function component
 */
function renderAndProcessFunctionComponent(
  type: React.ComponentType<any>,
  props: any,
  depth: number
): ReactNode {
  try {
    let rendered: ReactNode;
    if (type.prototype?.isReactComponent) {
      // Class component
      const ClassComponent = type as React.ComponentClass<any>;
      const instance = new ClassComponent(props);
      rendered = instance.render();
    } else {
      // Function component
      const FunctionComponent = type as React.FC<any>;
      rendered = FunctionComponent(props);
    }
    log(`${'  '.repeat(depth)}Function component rendered:`, rendered);
    return injectMetadata(rendered, depth + 1);
  } catch (e) {
    warn(`${'  '.repeat(depth)}⚠️ Failed to render component: ${getDisplayType(type)}`, e);
    return <>{props.children}</>;
  }
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
