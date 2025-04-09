import React, {
  ReactElement,
  ReactNode,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  ReactElement as RE,
} from 'react';

// Toggle verbose logs (set to true for debugging)
const SHOW_LOGS = true;
const log = (msg: string, ...args: any[]) => SHOW_LOGS && console.log(msg, ...args);
const warn = (msg: string, ...args: any[]) => SHOW_LOGS && console.warn(msg, ...args);

let counter = 1;
const store: Record<string, any> = {};
(global as any).__SHERLO_METADATA__ = store;

// Use React symbols to detect memo and forwardRef wrappers.
const MEMO_TYPE = Symbol.for('react.memo');
const FORWARD_REF_TYPE = Symbol.for('react.forward_ref');
// Additional symbols for context-related components.
const CONTEXT_TYPE = Symbol.for('react.context');
const PROVIDER_TYPE = Symbol.for('react.provider');

// Interfaces for wrapper types.
interface ForwardRefType {
  $$typeof: symbol;
  render?: (props: any, ref: any) => ReactNode;
}
interface MemoType {
  $$typeof: symbol;
  type?: (props: any) => ReactNode;
}

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
    if (type.$$typeof === CONTEXT_TYPE) return 'context';
    if (type.$$typeof === PROVIDER_TYPE) return 'provider';
    return 'unknownObj';
  }
  return 'unknown';
}

// Helpers for type checking using React symbols.
function isForwardRef(type: any): type is ForwardRefType {
  return type && typeof type === 'object' && type.$$typeof === FORWARD_REF_TYPE;
}
function isMemoComponent(type: any): type is MemoType {
  return type && typeof type === 'object' && type.$$typeof === MEMO_TYPE;
}

// Log additional type information for debugging.
function logTypeInfo(type: any, depth: number) {
  log(`${'  '.repeat(depth)}Type Info:`, {
    keys: Object.keys(type),
    renderType: typeof (type as any).render,
    typeType: typeof (type as any).type,
    $$typeof: type.$$typeof,
    displayName: type.displayName || type.name,
  });
}

/**
 * Repeatedly unwrap the element if it is a forwardRef or memo.
 * Extra guard: do not attempt to unwrap native components (string types) or
 * context-related components.
 */
function unwrapComponent(element: ReactElement, depth: number): ReactNode {
  let current: ReactNode = element;
  let iterations = 0;

  while (isValidElement(current) && iterations < 10) {
    const { type, props } = current as ReactElement;
    // Abort unwrapping for native or context components.
    if (typeof type === 'string') {
      log(`${'  '.repeat(depth)}Native component detected (${type}); abort unwrapping.`);
      break;
    }
    if (type.$$typeof === CONTEXT_TYPE || type.$$typeof === PROVIDER_TYPE) {
      log(`${'  '.repeat(depth)}Context/Provider detected; abort unwrapping.`);
      break;
    }

    log(`${'  '.repeat(depth)}Attempting to unwrap type: ${getDisplayType(type)}`);
    logTypeInfo(type, depth);

    if (isForwardRef(type)) {
      if (typeof type.render !== 'function') {
        warn(
          `${'  '.repeat(
            depth
          )}⚠️ ForwardRef detected but render is not a function. Aborting unwrapping.`
        );
        break;
      }
      try {
        log(`${'  '.repeat(depth)}🔄 Unwrapping forwardRef`);
        const unwrapped = type.render(props, null);
        log(`${'  '.repeat(depth)}Result of forwardRef unwrapping:`, unwrapped);
        if (!isValidElement(unwrapped)) {
          warn(
            `${'  '.repeat(
              depth
            )}⚠️ Unwrapped forwardRef result is not a valid React element. Aborting.`
          );
          break;
        }
        current = unwrapped;
      } catch (e) {
        warn(`${'  '.repeat(depth)}⚠️ Exception while unwrapping forwardRef:`, e);
        break;
      }
    } else if (isMemoComponent(type)) {
      if (typeof type.type !== 'function') {
        warn(
          `${'  '.repeat(depth)}⚠️ Memo detected but type is not a function. Aborting unwrapping.`
        );
        break;
      }
      try {
        log(`${'  '.repeat(depth)}🔄 Unwrapping memo`);
        const unwrapped = type.type(props);
        log(`${'  '.repeat(depth)}Result of memo unwrapping:`, unwrapped);
        if (!isValidElement(unwrapped)) {
          warn(
            `${'  '.repeat(depth)}⚠️ Unwrapped memo result is not a valid React element. Aborting.`
          );
          break;
        }
        if (unwrapped === current) break;
        current = unwrapped;
      } catch (e) {
        warn(`${'  '.repeat(depth)}⚠️ Exception while unwrapping memo:`, e);
        break;
      }
    } else {
      break;
    }
    iterations++;
  }
  if (iterations === 10) {
    warn(`${'  '.repeat(depth)}⚠️ Reached unwrapping iteration limit`);
  }
  return current;
}

/**
 * HOC that wraps a component so that its rendered output is processed
 * through our metadata injector.
 */
function withInjectedMetadata<P>(Component: React.ComponentType<P>) {
  return function MetadataInjectedComponent(props: P) {
    log(`withInjectedMetadata: Rendering component with props:`, props);
    try {
      let element: ReactNode;
      if (Component.prototype && Component.prototype.isReactComponent) {
        const ClassComponent = Component as React.ComponentClass<P>;
        const instance = new ClassComponent(props);
        element = instance.render();
      } else {
        const FunctionComponent = Component as React.FC<P>;
        element = FunctionComponent(props);
      }
      log(`withInjectedMetadata: Rendered element:`, element);
      return injectMetadata(element);
    } catch (e) {
      warn(`withInjectedMetadata: Error rendering component:`, e);
      return <>{null}</>;
    }
  };
}

/**
 * Recursively traverse the React element tree to inject metadata.
 * For primitives (strings, numbers) or context-related elements, returns the element unmodified.
 * When encountering unresolved memo components, wraps their inner function with our HOC.
 */
function injectMetadata(element: ReactNode, depth = 0): ReactNode {
  // If element is a primitive (string, number, null), return it immediately.
  if (typeof element !== 'object' || element === null) {
    log(`${'  '.repeat(depth)}Encountered primitive:`, element);
    return element;
  }
  if (!isValidElement(element)) {
    log(`${'  '.repeat(depth)}⛔️ Not a valid React element:`, element);
    return element;
  }

  const { type, props } = element;
  // Abort processing for Context Consumers/Providers to avoid their child-function issues.
  if (typeof type === 'object' && type !== null) {
    if (type.$$typeof === CONTEXT_TYPE || type.$$typeof === PROVIDER_TYPE) {
      warn(
        `${'  '.repeat(
          depth
        )}Context Consumer/Provider encountered; skipping metadata injection for this branch.`
      );
      return element;
    }
  }

  let unwrapped = unwrapComponent(element, depth);
  if (unwrapped !== element) {
    log(`${'  '.repeat(depth)}Element unwrapped. Processing the unwrapped element.`);
    return injectMetadata(unwrapped, depth);
  }

  const displayType = getDisplayType(type);
  const isPrim = isPrimitiveElement(type);
  log(`${'  '.repeat(depth)}🔍 Visiting element: { isPrimitive: ${isPrim}, type: ${displayType} }`);

  if (isMemoComponent(type)) {
    log(`${'  '.repeat(depth)}⚠️ Unresolved memo detected. Wrapping with HOC.`);
    if (typeof type.type !== 'function') {
      warn(
        `${'  '.repeat(depth)}⚠️ Underlying memo type is not a function. Skipping this element.`
      );
      return element;
    }
    const WrappedComponent = withInjectedMetadata(type.type);
    return <WrappedComponent {...props} />;
  }

  if (type === React.Fragment) {
    const children = React.Children.map(props.children, (child) =>
      injectMetadata(child, depth + 1)
    );
    return cloneElement(element, {}, children);
  }

  if (typeof type === 'function' && type.prototype?.isReactComponent) {
    log(`${'  '.repeat(depth)}📦 Class component: ${displayType}, processing children`);
    const children = React.Children.map(props.children, (child) =>
      injectMetadata(child, depth + 1)
    );
    return cloneElement(element, props, children);
  }

  if (typeof type === 'function') {
    try {
      const rendered = (type as React.FC<any>)(props);
      log(`${'  '.repeat(depth)}Function component rendered:`, rendered);
      return injectMetadata(rendered, depth + 1);
    } catch (e) {
      warn(`${'  '.repeat(depth)}⚠️ Failed to render function component: ${displayType}`, e);
      return element;
    }
  }

  if (isPrim) {
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

/**
 * MetadataInjector:
 *
 * This component wraps its children and recursively traverses the React element tree.
 * It attempts to unwrap forwardRef and memoized components and injects metadata
 * (such as styles, testID, nativeID) into a global store.
 * Enhanced logging and extra guards for native and context elements are provided
 * to prevent errors like "render is not a function (it is Object)".
 */
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
