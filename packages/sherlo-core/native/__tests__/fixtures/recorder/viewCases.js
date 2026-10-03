/**
 * The scripted views the recorder runs the original scroll engines and inspectors on (record.js),
 * and the lines the two recorders read them as (ios/recordViews.m, android/RecordViews.java).
 *
 * A number that JSON cannot hold (NaN, Infinity, -Infinity, -0) is written as its string; word()
 * turns either back into the recorders' words.
 */

/** A number as the recorders read it: strtod on iOS, parseInt or parseFloat on Android. */
function word(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (Object.is(value, -0)) return '-0';
  return String(value);
}

function hexOf(text) {
  return Buffer.from(text, 'utf8').toString('hex');
}

// ---- iOS scroll cases ----------------------------------------------------------------------------

/** A UIScrollView's numbers: enabled and in the window unless said otherwise. */
function iosScrollView({
  scrollEnabled = true,
  inWindow = true,
  viewportHeight = 800,
  contentHeight = 2000,
  insetTop = 0,
  insetBottom = 0,
} = {}) {
  return { scrollEnabled, inWindow, viewportHeight, contentHeight, insetTop, insetBottom };
}

function iosCandidate({ className = 'RCTEnhancedScrollView', hidden = false, alpha = 1, frame = [0, 0, 390, 844], ...scrollView } = {}) {
  return { className, hidden, alpha, frame, scrollView: iosScrollView(scrollView) };
}

function iosScrollCases() {
  const window = { windowWidth: 390, windowHeight: 844 };
  const pick = (name, candidates, size = window) => ({ name, kind: 'pick', ...size, candidates });
  const check = (name, scrollView) => ({ name, kind: 'check', scrollView: iosScrollView(scrollView) });
  const nudge = (name, scrollView, offset, lowestReachable, highestReachable) => ({
    name,
    kind: 'nudge',
    scrollView: iosScrollView(scrollView),
    offset,
    lowestReachable,
    highestReachable,
  });
  const checkpoint = (name, scrollView, { scale = 3, index, offsetPx, maxIndex, lowestReachable = -1e9, highestReachable = 1e9 }) => ({
    name,
    kind: 'checkpoint',
    scrollView: iosScrollView(scrollView),
    scale,
    index,
    offsetPx,
    maxIndex,
    lowestReachable,
    highestReachable,
  });

  return [
    pick('the first that fits, in the walk\'s order', [
      iosCandidate({ frame: [0, 700, 100, 40] }),
      iosCandidate(),
      iosCandidate({ frame: [0, 0, 390, 400] }),
    ]),
    pick('hidden, see-through, disabled and windowless views are passed over', [
      iosCandidate({ hidden: true }),
      iosCandidate({ alpha: 0.009 }),
      iosCandidate({ scrollEnabled: false }),
      iosCandidate({ inWindow: false }),
      iosCandidate({ alpha: 0.01 }),
    ]),
    pick('the framework\'s own scroll views are passed over', [
      iosCandidate({ className: '_UIQueuingScrollView' }),
      iosCandidate({ className: 'UIScrollView' }),
    ]),
    pick('the pick needs more than 1 point to scroll', [
      iosCandidate({ contentHeight: 801 }),
      iosCandidate({ contentHeight: 790, insetTop: 5.5, insetBottom: 5.5 }),
      iosCandidate({ contentHeight: 801.5 }),
    ]),
    pick('a view half off the window counts its visible half', [
      iosCandidate({ frame: [0, 900, 390, 844] }),
      iosCandidate({ frame: [0, 820, 390, 844] }),
      iosCandidate({ frame: [0, 600, 390, 844] }),
    ]),
    pick('a view of exactly a tenth of the window fits', [
      iosCandidate({ frame: [0, 0, 9.99, 100] }),
      iosCandidate({ frame: [0, 0, 10, 100] }),
    ], { windowWidth: 100, windowHeight: 100 }),
    pick('nothing fits', [
      iosCandidate({ contentHeight: 800 }),
      iosCandidate({ viewportHeight: 0 }),
      iosCandidate({ frame: [0, 0, 30, 30] }),
    ]),
    pick('no candidates', []),
    pick('a window of no size takes a view off it', [iosCandidate({ frame: [500, 500, 10, 10] })], {
      windowWidth: 0,
      windowHeight: 0,
    }),
    pick('content of no known height passes the numbers', [iosCandidate({ contentHeight: 'NaN' })]),

    check('more than 4 points to scroll', { contentHeight: 804.5 }),
    check('4 points to scroll are not enough', { contentHeight: 804 }),
    check('insets count towards the scroll', { contentHeight: 790, insetTop: 10, insetBottom: 5 }),
    check('disabled', { scrollEnabled: false }),
    check('out of the window', { inWindow: false }),
    check('no viewport', { viewportHeight: 0 }),
    check('a negative viewport', { viewportHeight: -10 }),

    nudge('at the top of a long list, down', {}, 0, -1e9, 1e9),
    nudge('at the bottom, up', {}, 1200, -1e9, 1e9),
    nudge('content a point shorter than the viewport cannot move', { contentHeight: 799 }, 0, -1e9, 1e9),
    nudge('a view that does not move when set', { contentHeight: 803 }, 0, 0, 0),
    nudge('half a point of range is too little either way', { contentHeight: 800.5 }, 0, -1e9, 1e9),
    nudge('under a top inset', { insetTop: 100 }, -100, -100, 1200),
    nudge('kept from moving the whole way', {}, 0, 0, 0.5),
    nudge('a top inset of no known size', { insetTop: 'NaN' }, 0, -1e9, 1e9),
    nudge('content of no known height', { contentHeight: 'NaN' }, 0, -1e9, 1e9),

    checkpoint('the first checkpoint is the top', {}, { index: 0, offsetPx: 2400, maxIndex: 3 }),
    checkpoint('the second is one step down, in points', {}, { index: 1, offsetPx: 2400, maxIndex: 3 }),
    checkpoint('past the end it stops at the bottom', {}, { index: 2, offsetPx: 2400, maxIndex: 3 }),
    checkpoint('an index past the last is the last', {}, { index: 5, offsetPx: 300, maxIndex: 2 }),
    checkpoint('a negative index is the first', {}, { index: -1, offsetPx: 300, maxIndex: 2 }),
    checkpoint('under insets', { insetTop: 100, insetBottom: 50 }, { index: 1, offsetPx: 600, maxIndex: 9 }),
    checkpoint('content shorter than the viewport is at the bottom', { contentHeight: 700 }, { index: 0, offsetPx: 600, maxIndex: 0 }),
    checkpoint('a view that stops short of the end', {}, { index: 9, offsetPx: 600, maxIndex: 9, highestReachable: 1000 }),
    checkpoint('within 2 pixels of the end is the bottom', {}, { index: 9, offsetPx: 600, maxIndex: 9, highestReachable: 1199.4 }),
    checkpoint('just over 2 pixels from the end is not', {}, { index: 9, offsetPx: 600, maxIndex: 9, highestReachable: 1199.3 }),
    checkpoint('scale 2 and half a pixel', {}, { scale: 2, index: 3, offsetPx: 300.5, maxIndex: 9 }),
    checkpoint('a last index below the first', {}, { index: 0, offsetPx: 600, maxIndex: -1 }),
  ];
}

function iosScrollViewWords(scrollView) {
  return [
    scrollView.scrollEnabled,
    scrollView.inWindow,
    scrollView.viewportHeight,
    scrollView.contentHeight,
    scrollView.insetTop,
    scrollView.insetBottom,
  ].map(word);
}

function iosScrollLine(scrollCase) {
  switch (scrollCase.kind) {
    case 'pick':
      return [
        'pick',
        word(scrollCase.windowWidth),
        word(scrollCase.windowHeight),
        word(scrollCase.candidates.length),
        ...scrollCase.candidates.flatMap((candidate) => [
          hexOf(candidate.className),
          word(candidate.hidden),
          word(candidate.alpha),
          ...iosScrollViewWords(candidate.scrollView),
          ...candidate.frame.map(word),
        ]),
      ].join(' ');
    case 'check':
      return ['check', ...iosScrollViewWords(scrollCase.scrollView)].join(' ');
    case 'nudge':
      return [
        'nudge',
        ...iosScrollViewWords(scrollCase.scrollView),
        ...[scrollCase.offset, scrollCase.lowestReachable, scrollCase.highestReachable].map(word),
      ].join(' ');
    case 'checkpoint':
      return [
        'checkpoint',
        ...iosScrollViewWords(scrollCase.scrollView),
        ...[
          scrollCase.scale,
          scrollCase.index,
          scrollCase.offsetPx,
          scrollCase.maxIndex,
          scrollCase.lowestReachable,
          scrollCase.highestReachable,
        ].map(word),
      ].join(' ');
  }
  throw new Error('unknown scroll case ' + scrollCase.kind);
}

// ---- Android scroll cases ------------------------------------------------------------------------

/** A view's scroll numbers: it scrolls both ways, is VISIBLE, and its range is readable. */
function androidScrollingView({ canScrollDown = true, canScrollUp = true, visibility = 0, height = 2000, range = 3000 } = {}) {
  return { canScrollDown, canScrollUp, visibility, height, range };
}

function androidCandidate({ internal = false, globallyVisible = true, visible = [1080, 2000], ...view } = {}) {
  return { internal, globallyVisible, visible, view: androidScrollingView(view) };
}

/** How a view scrolls: a ScrollView moves its scrollY with its offset, a RecyclerView its offset alone. */
function scrolling({ offsetAlone = false, scrollY = 0, offset = 0, lowestReachable = 0, highestReachable = 1000 } = {}) {
  return { offsetAlone, scrollY, offset, lowestReachable, highestReachable };
}

function androidScrollCases() {
  const root = { rootWidth: 1080, rootHeight: 2400 };
  const pick = (name, candidates, size = root) => ({ name, kind: 'pick', ...size, candidates });
  const check = (name, view) => ({ name, kind: 'check', view: androidScrollingView(view) });
  const nudge = (name, view, how) => ({ name, kind: 'nudge', view: androidScrollingView(view), scrolling: scrolling(how) });
  const checkpoint = (name, view, how, { extent = 2000, index, offsetPx, maxIndex }) => ({
    name,
    kind: 'checkpoint',
    view: androidScrollingView(view),
    extent,
    scrolling: scrolling(how),
    index,
    offsetPx,
    maxIndex,
  });

  return [
    pick('the first that fits, in the walk\'s order', [
      androidCandidate({ visible: [1080, 100] }),
      androidCandidate(),
      androidCandidate({ visible: [1080, 1000] }),
    ]),
    pick('views that cannot scroll, are not VISIBLE, are the framework\'s own or are off screen are passed over', [
      androidCandidate({ canScrollDown: false, canScrollUp: false }),
      androidCandidate({ visibility: 4 }),
      androidCandidate({ visibility: 8 }),
      androidCandidate({ internal: true }),
      androidCandidate({ globallyVisible: false }),
      androidCandidate({ canScrollDown: false }),
    ]),
    pick('a range that cannot be read leaves the platform\'s word', [androidCandidate({ range: -1 })]),
    pick('the pick needs more than 4 pixels to scroll', [
      androidCandidate({ range: 2004 }),
      androidCandidate({ range: 2005 }),
    ]),
    pick('no height is no viewport', [androidCandidate({ height: 0 })]),
    pick('a view of exactly a tenth of the root fits', [
      androidCandidate({ visible: [10, 99] }),
      androidCandidate({ visible: [10, 100] }),
    ], { rootWidth: 100, rootHeight: 100 }),
    pick('a tenth rounds down', [androidCandidate({ visible: [999, 1] })], { rootWidth: 99, rootHeight: 101 }),
    pick('nothing fits', [
      androidCandidate({ range: 2000 }),
      androidCandidate({ visible: [100, 100] }),
    ]),
    pick('no candidates', []),

    check('more than 4 pixels to scroll', { range: 2005 }),
    check('4 pixels to scroll are not enough', { range: 2004 }),
    check('it cannot scroll either way', { canScrollDown: false, canScrollUp: false }),
    check('it can scroll up only', { canScrollDown: false }),
    check('not VISIBLE', { visibility: 8 }),
    check('a range that cannot be read', { range: -1 }),
    check('a range of 0', { range: 0 }),
    check('no height', { height: 0 }),

    nudge('a ScrollView at the top moves down', {}, {}),
    nudge('a ScrollView at the bottom moves up', {}, { scrollY: 1000, offset: 1000 }),
    nudge('a RecyclerView moves its offset alone', {}, { offsetAlone: true }),
    nudge('a RecyclerView at the bottom moves up', {}, { offsetAlone: true, offset: 1000 }),
    nudge('a view that does not move either way', {}, { highestReachable: 0 }),

    checkpoint('the first checkpoint is the top', {}, {}, { index: 0, offsetPx: 800, maxIndex: 3 }),
    checkpoint('the second is one step down', {}, {}, { index: 1, offsetPx: 800, maxIndex: 3 }),
    checkpoint('past the end it stops at the bottom', {}, {}, { index: 2, offsetPx: 800, maxIndex: 3 }),
    checkpoint('an index past the last is the last', {}, {}, { index: 7, offsetPx: 300, maxIndex: 2 }),
    checkpoint('a negative index is the first', {}, { scrollY: 300, offset: 300 }, { index: -2, offsetPx: 300, maxIndex: 2 }),
    checkpoint('an extent that cannot be read is the height', { height: 1500 }, {}, { extent: -1, index: 1, offsetPx: 800, maxIndex: 3 }),
    checkpoint('a range that cannot be read is the bottom', { range: -1 }, {}, { index: 1, offsetPx: 800, maxIndex: 3 }),
    checkpoint('within 4 pixels of the end is the bottom', {}, { highestReachable: 996 }, { index: 3, offsetPx: 800, maxIndex: 3 }),
    checkpoint('5 pixels from the end is not', {}, { highestReachable: 995 }, { index: 3, offsetPx: 800, maxIndex: 3 }),
    checkpoint('a RecyclerView left part way scrolls back to the top', {}, { offsetAlone: true, offset: 300 }, { index: 0, offsetPx: 800, maxIndex: 3 }),
    checkpoint('an index times the step past the int range wraps', { range: 2000000000 }, { highestReachable: 2000000000 }, { index: 3, offsetPx: 1000000000, maxIndex: 3 }),
  ];
}

function androidScrollingViewWords(view) {
  return [view.canScrollDown, view.canScrollUp, view.visibility, view.height, view.range].map(word);
}

function scrollingWords(how) {
  return [how.offsetAlone, how.scrollY, how.offset, how.lowestReachable, how.highestReachable].map(word);
}

function androidScrollLine(scrollCase) {
  switch (scrollCase.kind) {
    case 'pick':
      return [
        'pick',
        word(scrollCase.rootWidth),
        word(scrollCase.rootHeight),
        word(scrollCase.candidates.length),
        ...scrollCase.candidates.flatMap((candidate) => [
          candidate.internal ? 'internal' : 'app',
          ...androidScrollingViewWords(candidate.view),
          word(candidate.globallyVisible),
          ...candidate.visible.map(word),
        ]),
      ].join(' ');
    case 'check':
      return ['check', ...androidScrollingViewWords(scrollCase.view)].join(' ');
    case 'nudge':
      return ['nudge', ...androidScrollingViewWords(scrollCase.view), ...scrollingWords(scrollCase.scrolling)].join(' ');
    case 'checkpoint':
      return [
        'checkpoint',
        ...androidScrollingViewWords(scrollCase.view),
        word(scrollCase.extent),
        ...scrollingWords(scrollCase.scrolling),
        ...[scrollCase.index, scrollCase.offsetPx, scrollCase.maxIndex].map(word),
      ].join(' ');
  }
  throw new Error('unknown scroll case ' + scrollCase.kind);
}

// ---- iOS inspector trees -------------------------------------------------------------------------

function iosInspectedView(depth, className, { hidden = false, alpha = 1, inWindow = true, frame = [0, 0, 390, 100], reactTag = null, tag = 0 } = {}) {
  return { depth, className, hidden, alpha, inWindow, frame, reactTag, tag };
}

function iosTree(name, views, { windowHeight = 844, nativeScale = 3, bodyPointSize = 17, systemFontSize = 17 } = {}) {
  return { name, windowHeight, nativeScale, bodyPointSize, systemFontSize, views };
}

/** A root with four groups of 3000 leaves: the 10000-node limit falls inside the fourth group. */
function iosManyViews() {
  const views = [iosInspectedView(0, 'RCTRootView', { frame: [0, 0, 390, 844], reactTag: 1 })];
  for (let group = 0; group < 4; group++) {
    views.push(iosInspectedView(1, 'RCTView', { frame: [0, 0, 390, 844], reactTag: 10 + group }));
    for (let leaf = 0; leaf < 3000; leaf++) {
      views.push(iosInspectedView(2, 'RCTParagraphComponentView', { frame: [0, leaf % 800, 1, 1] }));
    }
  }
  return iosTree('ten thousand views at most', views);
}

/**
 * A view for each set of names a view's dictionary can hold - each of x, y, width and height
 * there or not (a number that is not finite is left out), and an id there or not - because
 * NSJSONSerialization writes a dictionary's names in an order that depends on which it holds.
 */
function iosKeySets() {
  const views = [iosInspectedView(0, 'RCTRootView', { frame: [0, 0, 390, 844] })];
  for (let present = 0; present < 32; present++) {
    const frame = [10, 20, 30, 40].map((value, bit) => (present & (1 << bit) ? value : 'NaN'));
    const hasId = (present & 16) !== 0;
    views.push(iosInspectedView(1, 'RCTView', { frame, reactTag: hasId ? present : null }));
  }
  return iosTree('every set of names a view writes', views);
}

/** A chain of views 55 deep: nothing deeper than 50 levels below the root is written. */
function iosDeepChain() {
  const views = Array.from({ length: 56 }, (_, depth) => iosInspectedView(depth, 'RCTView', { reactTag: depth + 1 }));
  return iosTree('fifty levels below the root at most', views);
}

function iosInspectorTrees() {
  return [
    iosTree('a small screen', [
      iosInspectedView(0, 'RCTRootView', { frame: [0, 0, 390, 844], reactTag: 1 }),
      iosInspectedView(1, 'RCTView', { frame: [0, 0, 390, 100], reactTag: 3 }),
      iosInspectedView(2, 'RCTParagraphComponentView', { frame: [16, 50, 200, 20.333333333333332], reactTag: 5 }),
      iosInspectedView(1, 'UIView', { frame: [0, 100, 390, 44], tag: 7, hidden: true }),
      iosInspectedView(1, 'RCTImageComponentView', { frame: [10, 200, 50, 50], reactTag: 0, alpha: 0 }),
      iosInspectedView(1, 'RCTView', { frame: [10, 300, 50, 50], alpha: 0.01, tag: -4 }),
      iosInspectedView(1, 'RCTView', { frame: [10, 400, 50, 50], alpha: 0.011, inWindow: false }),
    ]),
    iosTree('views off the window are cut, with everything inside them', [
      iosInspectedView(0, 'RCTRootView', { frame: [0, 0, 390, 844] }),
      iosInspectedView(1, 'RCTView', { frame: [0, 844, 390, 100], reactTag: 2 }),
      iosInspectedView(2, 'RCTView', { frame: [0, 10, 390, 100], reactTag: 3 }),
      iosInspectedView(1, 'RCTView', { frame: [0, -100, 390, 100], reactTag: 4 }),
      iosInspectedView(1, 'RCTView', { frame: [0, -100, 390, 100.5], reactTag: 5 }),
      iosInspectedView(2, 'RCTView', { frame: [0, 900, 390, 10], reactTag: 6 }),
      iosInspectedView(2, 'RCTView', { frame: [0, 843.5, 390, 10], reactTag: 7 }),
      iosInspectedView(1, 'RCTView', { frame: [0, 'NaN', 390, 10], reactTag: 8 }),
    ]),
    iosTree('frames that are not finite leave their numbers out', [
      iosInspectedView(0, 'RCTRootView', { frame: [0, 0, 390, 844] }),
      iosInspectedView(1, 'RCTView', { frame: ['NaN', 10, 'Infinity', 10], reactTag: 2 }),
      iosInspectedView(1, 'RCTView', { frame: [0, 10, 10, '-Infinity'], reactTag: 3 }),
    ]),
    iosTree('class names, escaped as NSJSONSerialization escapes them', [
      iosInspectedView(0, 'RCTRootView', { frame: [0, 0, 390, 844] }),
      iosInspectedView(1, 'Quote"Back\\Slash/Slash', { tag: 1 }),
      iosInspectedView(1, 'Tab\tNewline\nReturn\rBell\u0007Unit\u001fDelete\u007f', { tag: 2 }),
      iosInspectedView(1, 'Backspace\bFormfeed\f', { tag: 3 }),
      iosInspectedView(1, 'Zażółć', { tag: 4 }),
      iosInspectedView(1, 'Emoji\u{1F600}', { tag: 5 }),
      iosInspectedView(1, 'MyApp.ProfileView', { tag: 6 }),
      iosInspectedView(1, '_TtC5MyApp11ProfileView', { tag: 7 }),
      iosInspectedView(1, 'Space Name<T>', { tag: 8 }),
      iosInspectedView(1, 'Line Separator', { tag: 9 }),
    ]),
    iosTree('numbers, written as NSJSONSerialization writes them', [
      iosInspectedView(0, 'RCTRootView', { frame: [0, 0, 390, 844], reactTag: 9007199254740993 }),
      iosInspectedView(1, 'RCTView', { frame: [0.1, 1 / 3, 1e21, 1e-7], reactTag: -5 }),
      iosInspectedView(1, 'RCTView', { frame: ['-0', '-0', 9007199254740994, 5e-324] }),
      iosInspectedView(1, 'RCTView', { frame: [1e15, 1, 1e17, 12345678901234567890] }),
      iosInspectedView(1, 'RCTView', { frame: [1e16, 2, 1e-300, 4.9406564584124654e-324] }),
      iosInspectedView(1, 'RCTView', { frame: [0.5, 100, -1.5, 2.5e-5] }),
      iosInspectedView(1, 'RCTView', { frame: [1e-5, 1e-4, 0.001, 0.01] }),
      iosInspectedView(1, 'RCTView', { frame: [1.7976931348623157e308, 2.2250738585072014e-308, 0.30000000000000004, 100.25] }),
      iosInspectedView(1, 'RCTView', { frame: [123456789012, 3, 1234567890123456, 98765.4321] }),
      iosInspectedView(1, 'RCTView', { frame: [-123.456, 0.000123456789, 1e100, -1e-100] }),
    ], { nativeScale: 1, bodyPointSize: 19, systemFontSize: 17 }),
    iosKeySets(),
    iosTree('a density alone', [iosInspectedView(0, 'RCTRootView', { frame: [0, 0, 390, 844] })], {
      systemFontSize: 0,
    }),
    iosTree('a font scale alone', [iosInspectedView(0, 'RCTRootView', { frame: [0, 0, 390, 844] })], {
      nativeScale: 'NaN',
    }),
    iosTree('a fractional screen scale', [
      iosInspectedView(0, 'RCTRootView', { frame: [0, 0, 375, 812] }),
      iosInspectedView(1, 'RCTView', { frame: [0.5, 10.25, 374.33333333333331, 20.666666666666668], reactTag: 2 }),
    ], { nativeScale: 2.88, bodyPointSize: 23, systemFontSize: 17 }),
    iosTree('a density and font scale that are not finite are left out', [
      iosInspectedView(0, 'RCTRootView', { frame: [0, 0, 390, 844] }),
    ], { nativeScale: 'NaN', bodyPointSize: 17, systemFontSize: 0 }),
    iosTree('a window of no height keeps only the views across its top', [
      iosInspectedView(0, 'RCTRootView', { frame: [0, 0, 390, 0] }),
      iosInspectedView(1, 'RCTView', { frame: [0, 0, 390, 10], reactTag: 2 }),
      iosInspectedView(1, 'RCTView', { frame: [0, -10, 390, 20], reactTag: 3 }),
    ], { windowHeight: 0 }),
    iosTree('a root alone', [iosInspectedView(0, 'UIView', { frame: [0, 0, 390, 844], tag: 0 })]),
    iosDeepChain(),
    iosManyViews(),
  ];
}

function iosInspectorLine(tree) {
  return [
    ...[tree.windowHeight, tree.nativeScale, tree.bodyPointSize, tree.systemFontSize, tree.views.length].map(word),
    ...tree.views.flatMap((view) => [
      word(view.depth),
      hexOf(view.className),
      word(view.hidden),
      word(view.alpha),
      word(view.inWindow),
      ...view.frame.map(word),
      view.reactTag === null ? '-' : word(view.reactTag),
      word(view.tag),
    ]),
  ].join(' ');
}

// ---- Android inspector trees ---------------------------------------------------------------------

// The recorder's view classes (android/RecordViews.java), and the simple name each one has.
const ANDROID_SIMPLE_NAMES = {
  DecorView: 'DecorView',
  LinearLayout: 'LinearLayout',
  FrameLayout: 'FrameLayout',
  ReactRootView: 'ReactRootView',
  ReactViewGroup: 'ReactViewGroup',
  ReactScrollView: 'ReactScrollView',
  ReactTextView: 'ReactTextView',
  ReactImageView: 'ReactImageView',
  Unicode: 'Ünicode',
  Dollar: 'My$View',
  anonymous: '',
};

function androidInspectedView(depth, viewClass, { globallyVisible = true, rect = [0, 63, 1080, 2337], screen = null, height = null, id = -1 } = {}) {
  return {
    depth,
    viewClass,
    globallyVisible,
    rect,
    screen: screen ?? [rect[0], rect[1]],
    height: height ?? rect[3] - rect[1],
    id,
  };
}

function androidTree(name, views, { viewportTop = 63, viewportBottom = 2337, density = '2.625', fontScale = '1.0' } = {}) {
  return { name, viewportTop, viewportBottom, density, fontScale, views };
}

function androidManyViews() {
  const views = [androidInspectedView(0, 'DecorView')];
  for (let group = 0; group < 4; group++) {
    views.push(androidInspectedView(1, 'ReactViewGroup', { id: 10 + group }));
    for (let leaf = 0; leaf < 3000; leaf++) {
      views.push(androidInspectedView(2, 'ReactTextView', { rect: [0, 63 + (leaf % 2000), 1, 64 + (leaf % 2000)] }));
    }
  }
  return androidTree('ten thousand views at most', views);
}

function androidDeepChain() {
  const views = Array.from({ length: 56 }, (_, depth) => androidInspectedView(depth, 'ReactViewGroup', { id: depth + 1 }));
  return androidTree('fifty levels below the root at most', views);
}

function androidInspectorTrees() {
  return [
    androidTree('a small screen', [
      androidInspectedView(0, 'DecorView', { rect: [0, 0, 1080, 2400] }),
      androidInspectedView(1, 'LinearLayout', { id: 16908290 }),
      androidInspectedView(2, 'FrameLayout'),
      androidInspectedView(3, 'ReactRootView', { id: 1 }),
      androidInspectedView(4, 'ReactViewGroup', { rect: [0, 63, 1080, 400], id: 3 }),
      androidInspectedView(5, 'ReactTextView', { rect: [42, 100, 600, 160], id: 5 }),
      androidInspectedView(4, 'ReactImageView', { globallyVisible: false, rect: [0, 0, 0, 0], screen: [0, 500], height: 100, id: 7 }),
      androidInspectedView(4, 'Dollar', { rect: [0, 600, 1080, 700], id: 0 }),
      androidInspectedView(4, 'Unicode', { rect: [0, 700, 1080, 800], id: 2147483647 }),
      androidInspectedView(4, 'anonymous', { rect: [-20, 800, 1080, 900] }),
    ]),
    androidTree('views off the viewport are cut, with everything inside them', [
      androidInspectedView(0, 'DecorView', { rect: [0, 0, 1080, 2400] }),
      androidInspectedView(1, 'ReactViewGroup', { rect: [0, 2337, 1080, 2400], id: 2 }),
      androidInspectedView(2, 'ReactTextView', { rect: [0, 100, 1080, 200], id: 3 }),
      androidInspectedView(1, 'ReactViewGroup', { rect: [0, 0, 1080, 63], id: 4 }),
      androidInspectedView(1, 'ReactViewGroup', { rect: [0, 0, 1080, 64], id: 5 }),
      androidInspectedView(2, 'ReactTextView', { rect: [0, 2400, 1080, 2500], id: 6 }),
      androidInspectedView(2, 'ReactTextView', { rect: [0, 2336, 1080, 2400], id: 7 }),
    ]),
    androidTree('a fractional density and font scale', [androidInspectedView(0, 'DecorView')], { density: '2.75', fontScale: '1.15' }),
    androidTree('small font scale', [androidInspectedView(0, 'DecorView')], { density: '0.75', fontScale: '0.85' }),
    androidTree('large font scale', [androidInspectedView(0, 'DecorView')], { density: '3.5', fontScale: '1.3' }),
    androidTree('whole density and font scale', [androidInspectedView(0, 'DecorView')], { density: '3', fontScale: '2' }),
    androidTree('a density of 1.33', [androidInspectedView(0, 'DecorView')], { density: '1.3312501', fontScale: '0.9' }),
    androidTree('a tiny density and a negative zero', [androidInspectedView(0, 'DecorView')], { density: '0.0001', fontScale: '-0' }),
    androidTree('a huge density and font scale', [androidInspectedView(0, 'DecorView')], { density: '1.0E10', fontScale: '3.4028235E38' }),
    androidTree('a font scale that is not finite is refused', [androidInspectedView(0, 'DecorView')], { fontScale: 'NaN' }),
    androidTree('a density that is not finite is refused', [androidInspectedView(0, 'DecorView')], { density: 'Infinity' }),
    androidTree('a root alone', [androidInspectedView(0, 'DecorView', { id: 0 })]),
    androidDeepChain(),
    androidManyViews(),
  ];
}

function androidInspectorLine(tree) {
  return [
    ...[tree.viewportTop, tree.viewportBottom, tree.density, tree.fontScale, tree.views.length].map(word),
    ...tree.views.flatMap((view) => [
      word(view.depth),
      view.viewClass,
      word(view.globallyVisible),
      ...view.rect.map(word),
      ...view.screen.map(word),
      word(view.height),
      word(view.id),
    ]),
  ].join(' ');
}

module.exports = {
  ANDROID_SIMPLE_NAMES,
  androidInspectorLine,
  androidInspectorTrees,
  androidScrollCases,
  androidScrollLine,
  iosInspectorLine,
  iosInspectorTrees,
  iosScrollCases,
  iosScrollLine,
};
