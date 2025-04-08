import React, {
  ReactElement,
  ReactNode,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
} from 'react';

// Toggle logs
const SHOW_LOGS = false;
const log = (msg: string, ...args: any[]) => SHOW_LOGS && console.log(msg, ...args);
const warn = (msg: string, ...args: any[]) => SHOW_LOGS && console.warn(msg, ...args);

let counter = 1;
const store: Record<string, any> = {};
(global as any).__SHERLO_METADATA__ = store;

// Use React symbols to detect memo and forwardRef wrappers.
const MEMO_TYPE = Symbol.for('react.memo');
const FORWARD_REF_TYPE = Symbol.for('react.forward_ref');

// Check if a type is a primitive (e.g. "View", "Text", etc.)
function isPrimitiveElement(type: any): boolean {
  return typeof type === 'string';
}

// Get a displayable name for logging.
function getDisplayType(type: any): string {
  if (typeof type === 'string') return type;
  if (typeof type === 'function') return type.displayName || type.name || 'anonymous';
  if (typeof type === 'object' && type !== null) {
    if (type.$$typeof === FORWARD_REF_TYPE) return 'forwardRef';
    if (type.$$typeof === MEMO_TYPE) return 'memo';
    return 'anonymous';
  }
  return 'unknown';
}

// Helpers for type checking using React symbols.
function isForwardRef(type: any): boolean {
  return type && typeof type === 'object' && type.$$typeof === FORWARD_REF_TYPE;
}
function isMemoComponent(type: any): boolean {
  return type && typeof type === 'object' && type.$$typeof === MEMO_TYPE;
}

/**
 * Repeatedly unwrap the element while it is a forwardRef or memo.
 * If unwrapping doesn’t produce a new element, break out of the loop.
 */
function unwrapComponent(element: ReactElement, depth: number): ReactNode {
  let current: ReactNode = element;
  let iterations = 0;
  while (isValidElement(current) && iterations < 10) {
    const prev = current;
    const { type, props } = current as ReactElement;
    if (isForwardRef(type)) {
      try {
        log(`${'  '.repeat(depth)}🔄 Unwrapping forwardRef`);
        current = type.render(props, null);
      } catch (e) {
        warn(`${'  '.repeat(depth)}⚠️ Failed to unwrap forwardRef:`, e);
        break;
      }
    } else if (isMemoComponent(type)) {
      try {
        log(`${'  '.repeat(depth)}🔄 Unwrapping memo`);
        const unwrapped = type.type(props);
        // If unwrapping doesn’t change the element, break.
        if (unwrapped === current) break;
        current = unwrapped;
      } catch (e) {
        warn(`${'  '.repeat(depth)}⚠️ Failed to unwrap memo:`, e);
        break;
      }
    } else {
      break;
    }
    iterations++;
    if (current === prev) break;
  }
  if (iterations === 10) {
    warn(`${'  '.repeat(depth)}⚠️ Reached unwrapping iteration limit`);
  }
  return current;
}

/**
 * HOC that wraps a component so that its rendered output is injected
 * with metadata.
 */
function withInjectedMetadata<P>(Component: React.ComponentType<P>) {
  return function MetadataInjectedComponent(props: P) {
    const element = Component(props);
    // Recursively inject metadata in the returned element.
    return injectMetadata(element);
  };
}

/**
 * Recursively traverse the React element tree to inject metadata.
 *
 * When encountering an unresolved memo, we wrap its underlying function in a HOC,
 * forcing its render output to be processed.
 */
function injectMetadata(element: ReactNode, depth = 0): ReactNode {
  if (!isValidElement(element)) {
    log(`${'  '.repeat(depth)}⛔️ Not a valid React element:`, element);
    return element;
  }

  // Unwrap memo/forwardRef wrappers.
  let unwrapped = unwrapComponent(element, depth);
  if (unwrapped !== element) {
    // Process the result of unwrapping.
    return injectMetadata(unwrapped, depth);
  }

  const { type, props } = element;
  const displayType = getDisplayType(type);
  const isPrimitive = isPrimitiveElement(type);

  log(
    `${'  '.repeat(
      depth
    )}🔍 Visiting element: { isPrimitive: ${isPrimitive}, type: ${displayType} }`
  );

  // If we still have a memo component that hasn't been unwrapped,
  // wrap its underlying render function with a HOC.
  if (isMemoComponent(type)) {
    log(`${'  '.repeat(depth)}⚠️ Unresolved memo detected. Wrapping with HOC.`);
    // Retrieve the inner component function.
    const underlying = type.type;
    // Wrap it with our HOC.
    const WrappedComponent = withInjectedMetadata(underlying);
    return <WrappedComponent {...props} />;
  }

  // Handle React.Fragment.
  if (type === React.Fragment) {
    const children = React.Children.map(props.children, (child) =>
      injectMetadata(child, depth + 1)
    );
    return cloneElement(element, {}, children);
  }

  // Handle class components by processing their children.
  if (typeof type === 'function' && type.prototype?.isReactComponent) {
    log(`${'  '.repeat(depth)}📦 Class component: ${displayType}, processing children`);
    const children = React.Children.map(props.children, (child) =>
      injectMetadata(child, depth + 1)
    );
    return cloneElement(element, props, children);
  }

  // Handle function components that haven't been unwrapped.
  if (typeof type === 'function') {
    try {
      const rendered = type(props);
      return injectMetadata(rendered, depth + 1);
    } catch (e) {
      warn(`${'  '.repeat(depth)}⚠️ Failed to render function component: ${displayType}`, e);
      return element;
    }
  }

  // Handle primitive components (e.g. native views).
  if (isPrimitive) {
    const id = `sherlo-${counter++}`;
    const nativeID = props.nativeID ?? id;
    const updatedProps = { ...props, nativeID };

    store[nativeID] = {
      style: props?.style,
      testID: props?.testID,
      nativeID,
    };

    log(`${'  '.repeat(depth)}✅ Injected metadata for ${nativeID}`);

    const children = React.Children.map(props.children, (child) =>
      injectMetadata(child, depth + 1)
    );
    return cloneElement(element, updatedProps, children);
  }

  // Fallback: if the element has children, process them.
  if (props?.children) {
    const children = React.Children.map(props.children, (child) =>
      injectMetadata(child, depth + 1)
    );
    return cloneElement(element, props, children);
  }

  log(`${'  '.repeat(depth)}❓ Unknown element type, skipping metadata injection.`);
  return element;
}

type MetadataInjectorProps = {
  children: ReactNode;
};

export function MetadataInjector({ children }: MetadataInjectorProps): ReactElement {
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      log('[🧩 MetadataInjector] Metadata store:', JSON.stringify(store, null, 2));
    }
  }, []);

  log('[🧩 MetadataInjector] Starting metadata injection...');
  const processedChildren = injectMetadata(children);
  log('[🧩 MetadataInjector] Final metadata store:', JSON.stringify(store, null, 2));

  return <>{processedChildren}</>;
}
