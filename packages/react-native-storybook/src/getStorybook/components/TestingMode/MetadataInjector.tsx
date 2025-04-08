import React, {
  ReactElement,
  ReactNode,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  ForwardRefExoticComponent,
} from 'react';

let counter = 1;
const store: Record<string, any> = {};
(global as any).__SHERLO_METADATA__ = store;

function isPrimitiveElement(type: any): boolean {
  return typeof type === 'string'; // E.g., 'View', 'Text', etc.
}

function getDisplayType(type: any): string {
  if (typeof type === 'string') return type;
  if (typeof type === 'function') return type.name || 'anonymous';
  if (typeof type === 'object') {
    if (type?.$$typeof?.toString() === 'Symbol(react.forward_ref)') return 'forwardRef';
    return 'anonymous';
  }
  return 'unknown';
}

// Type guard for forward ref components
function isForwardRef(type: any): type is ForwardRefExoticComponent<any> {
  return (
    typeof type === 'object' &&
    type !== null &&
    '$$typeof' in type &&
    type.$$typeof &&
    type.$$typeof.toString() === 'Symbol(react.forward_ref)'
  );
}

function injectMetadata(element: ReactNode, depth = 0): ReactNode {
  if (!isValidElement(element)) {
    console.log(`${'  '.repeat(depth)}⛔️ Not a valid React element:`, element);
    return element;
  }

  const { type, props } = element;
  const displayType = getDisplayType(type);
  const isPrimitive = isPrimitiveElement(type);

  console.log(`${'  '.repeat(depth)}🔍 Visiting element:`, { isPrimitive, type: displayType });

  // Handle fragments
  if (type === React.Fragment) {
    const children = React.Children.map(props.children, (child) =>
      injectMetadata(child, depth + 1)
    );
    return cloneElement(element, {}, children);
  }

  // Handle forwardRef
  if (isForwardRef(type)) {
    let rendered;
    try {
      if ('render' in type && typeof type.render === 'function') {
        rendered = type.render(props, null);
      } else {
        console.warn(`${'  '.repeat(depth)}⚠️ ForwardRef doesn't have a render method`);
        return element;
      }
    } catch (e) {
      console.warn(`${'  '.repeat(depth)}⚠️ Failed to render forwardRef:`, e);
      return element;
    }
    return injectMetadata(rendered, depth + 1);
  }

  // Handle class components
  if (typeof type === 'function' && type.prototype?.isReactComponent) {
    console.log(`${'  '.repeat(depth)}📦 Found class component: ${displayType}, skipping render`);
    const children = React.Children.map(props.children, (child) =>
      injectMetadata(child, depth + 1)
    );
    return cloneElement(element, props, children);
  }

  // Handle function components
  if (typeof type === 'function') {
    let rendered;
    try {
      const functionComponent = type as (props: any) => ReactNode;
      rendered = functionComponent(props);
    } catch (e) {
      console.warn(`${'  '.repeat(depth)}⚠️ Failed to render component: ${displayType}`, e);
      return element;
    }
    return injectMetadata(rendered, depth + 1);
  }

  // Handle primitives (View, Text, etc.)
  if (isPrimitive) {
    const id = `sherlo-${counter++}`;
    const nativeID = props.nativeID ?? id;
    const updatedProps = { ...props, nativeID };

    store[nativeID] = {
      style: props?.style,
      testID: props?.testID,
      nativeID,
    };

    console.log(`${'  '.repeat(depth)}✅ Injected metadata for ${nativeID}`);

    const children = React.Children.map(props.children, (child) =>
      injectMetadata(child, depth + 1)
    );

    return cloneElement(element, updatedProps, children);
  }

  console.log(`${'  '.repeat(depth)}❓ Unknown type, skipping`);
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
      console.log('[🧩 MetadataInjector] Metadata store:', JSON.stringify(store, null, 2));
    }
  }, []);

  console.log('[🧩 MetadataInjector] Injecting metadata into children...');
  const processedChildren = injectMetadata(children);
  console.log('[🧩 MetadataInjector] Final metadata store:', JSON.stringify(store, null, 2));

  return <>{processedChildren}</>;
}
