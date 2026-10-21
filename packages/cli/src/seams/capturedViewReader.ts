/**
 * THE VIEW TREE OFF THE WIRE - the capture socket's reader for the one nested value an app's answer
 * carries, kept apart so the socket file reads the answer's facts and nothing else.
 */
import type { CapturedView } from '../render/capturedStory';

/**
 * One view tree from the wire, read the way the screen needs it: every node's lists filled in, and
 * only the fields that are there kept. A node the app did not name has no component names, a text
 * view that says nothing has no text, and an app older than `size`/`style`/`props` leaves them
 * absent rather than invented.
 *
 * `testID` RIDES INSIDE `props`, THE SAME PLACE `placeholder`, `numberOfLines` AND
 * `accessibilityLabel` DO. The wire carries it as its own field (see CapturedViewTree in the SDK),
 * because it is matched to the view the same way style is, not read off a fiber's props the way
 * the other three are - but the screen draws all four as one set of attributes on the tag, so this
 * is where they are merged into one.
 */
export function readCapturedView(value: unknown): CapturedView {
  const view = value as
    | {
        primitive?: unknown;
        components?: unknown;
        text?: unknown;
        size?: unknown;
        style?: unknown;
        testID?: unknown;
        props?: unknown;
        children?: unknown;
      }
    | null
    | undefined;

  const size = readCapturedViewSize(view?.size);
  const style = readCapturedViewStyle(view?.style);
  const props = readCapturedViewProps(view?.testID, view?.props);

  return {
    primitive: typeof view?.primitive === 'string' ? view.primitive : '',
    components: Array.isArray(view?.components)
      ? view.components.filter((name): name is string => typeof name === 'string')
      : [],
    ...(typeof view?.text === 'string' && { text: view.text }),
    ...(size && { size }),
    ...(style && { style }),
    ...(props && { props }),
    children: Array.isArray(view?.children) ? view.children.map(readCapturedView) : [],
  };
}

/** The view's box in points, or nothing when the wire said nothing readable about it. */
function readCapturedViewSize(value: unknown): { width: number; height: number } | undefined {
  const size = value as { width?: unknown; height?: unknown } | null | undefined;
  if (typeof size?.width !== 'number' || typeof size?.height !== 'number') return undefined;
  return { width: size.width, height: size.height };
}

/** The view's merged React style, as the wire already merged it - read through, not re-merged. */
function readCapturedViewStyle(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

/**
 * The testID matched to the view, and the placeholder/numberOfLines/accessibilityLabel its own
 * fiber carried.
 */
function readCapturedViewProps(
  testID: unknown,
  props: unknown
): Record<string, string | number | boolean> | undefined {
  const wireProps = props as
    | { placeholder?: unknown; numberOfLines?: unknown; accessibilityLabel?: unknown }
    | null
    | undefined;
  const read: Record<string, string | number | boolean> = {};

  if (typeof testID === 'string') read.testID = testID;
  if (typeof wireProps?.placeholder === 'string') read.placeholder = wireProps.placeholder;
  if (typeof wireProps?.numberOfLines === 'number') read.numberOfLines = wireProps.numberOfLines;
  if (typeof wireProps?.accessibilityLabel === 'string') {
    read.accessibilityLabel = wireProps.accessibilityLabel;
  }

  return Object.keys(read).length > 0 ? read : undefined;
}
