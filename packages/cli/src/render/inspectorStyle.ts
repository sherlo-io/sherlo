/**
 * THE STYLE BLOCK, THE WAY SHERLO'S WEB INSPECTOR PRINTS IT.
 *
 * A capture's screen draws a view's React style the way the inspector on the build page draws it,
 * so a developer reads one rendering in both places. Two things decide what that looks like, and
 * both are the inspector's own: the ORDER the keys print in (layout, then box, then typography,
 * then effects - the SMACSS order, adapted to React Native), and the SHORTHANDS it folds four equal
 * sides into (`padding: 8` for four equal paddings, `borderRadius` for four equal corners).
 *
 * A COPY, ON PURPOSE. The inspector lives in a private package this public one cannot depend on,
 * so the order and the folds are written here a second time, the way the stabilization numbers
 * already are. A change to the inspector's order is a change to this list.
 *
 * Pure: an object in, ordered entries out. No React Native import - a style here is whatever the
 * app's fibers carried, read as a plain object.
 */

/** One style key and its value, in the order the inspector prints them. */
export type StyleEntry = [key: string, value: unknown];

/** The inspector's order, from layout to box model to typography to visual to effects. */
const INSPECTOR_PROPERTY_ORDER: string[] = [
  // Layout and positioning
  'position',
  'zIndex',
  'top',
  'right',
  'bottom',
  'left',
  'display',
  'overflow',

  // Flexbox
  'flex',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'flexDirection',
  'flexWrap',
  'alignItems',
  'alignSelf',
  'alignContent',
  'justifyContent',
  'gap',
  'rowGap',
  'columnGap',
  'aspectRatio',

  // Sizing
  'width',
  'minWidth',
  'maxWidth',
  'height',
  'minHeight',
  'maxHeight',

  // Margin
  'margin',
  'marginVertical',
  'marginHorizontal',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',

  // Padding
  'padding',
  'paddingVertical',
  'paddingHorizontal',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',

  // Borders
  'borderWidth',
  'borderColor',
  'borderStyle',
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomRightRadius',
  'borderBottomLeftRadius',

  // Background and opacity
  'backgroundColor',
  'opacity',

  // Typography
  'color',
  'fontFamily',
  'fontWeight',
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'textAlign',
  'textDecorationLine',
  'textTransform',
  'includeFontPadding',
  'textShadowColor',
  'textShadowOffset',
  'textShadowRadius',

  // Shadows and elevation
  'shadowColor',
  'shadowOffset',
  'shadowOpacity',
  'shadowRadius',
  'elevation',

  // Transforms
  'transform',
  'transformMatrix',
  'backfaceVisibility',
  'perspective',

  // Images
  'tintColor',
];

const PRIORITY = new Map(INSPECTOR_PROPERTY_ORDER.map((key, index) => [key.toLowerCase(), index]));

/**
 * A style as the inspector prints it: the four-sided shorthands folded, then the keys in the
 * inspector's order, with a key the order does not know sorted after the ones it does.
 */
export function inspectorStyleEntries(style: Record<string, unknown> | undefined): StyleEntry[] {
  if (!style) return [];

  const folded = foldShorthands(style);
  return Object.entries(folded).sort(([a], [b]) => {
    const ai = PRIORITY.get(a.toLowerCase());
    const bi = PRIORITY.get(b.toLowerCase());
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return a.localeCompare(b);
  });
}

/** Four equal corners print as one radius; four equal sides as one padding or margin. */
function foldShorthands(style: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...style };

  const corners = [
    'borderTopLeftRadius',
    'borderTopRightRadius',
    'borderBottomRightRadius',
    'borderBottomLeftRadius',
  ];
  if (corners.every((key) => out[key] !== undefined)) {
    const values = corners.map((key) => out[key]);
    if (values.every((value) => value === values[0])) {
      out.borderRadius = values[0];
      corners.forEach((key) => delete out[key]);
    }
  }

  for (const base of ['padding', 'margin']) {
    const [top, right, bottom, left] = ['Top', 'Right', 'Bottom', 'Left'].map(
      (side) => `${base}${side}`
    );
    if ([top, right, bottom, left].some((key) => out[key] === undefined)) continue;

    const t = out[top];
    const r = out[right];
    const b = out[bottom];
    const l = out[left];

    if (t === r && r === b && b === l) {
      out[base] = t;
      [top, right, bottom, left].forEach((key) => delete out[key]);
      continue;
    }
    if (t === b) {
      out[`${base}Vertical`] = t;
      delete out[top];
      delete out[bottom];
    }
    if (l === r) {
      out[`${base}Horizontal`] = l;
      delete out[left];
      delete out[right];
    }
  }

  return out;
}

/**
 * A colour as the inspector shows it: six or eight hex digits, upper case. A colour written any
 * other way (`transparent`, a name, an rgba) is left as the app wrote it.
 */
export function inspectorHex(value: string): string {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/i.exec(value);
  if (short) {
    const [, r, g, b, a] = short;
    return `#${r}${r}${g}${g}${b}${b}${a ? `${a}${a}` : ''}`.toUpperCase();
  }
  if (/^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) return value.toUpperCase();
  return value;
}

/** Whether a style key holds a colour - the inspector decides it by the key's name. */
export function isColourKey(key: string): boolean {
  return key.toLowerCase().includes('color');
}
