import type { View } from '@storybook/react-native';
import type { StoryMocks } from '../mocking/mockDeclaration';

import type { Snapshot as SnapshotTheCoreWrites } from '../sealedCore/seam';

// The runner's story entries and the inspector's reading cross the seam, so they are declared there.
export type { InspectorData, InspectorDataNode, SnapshotMode, StoryId } from '../sealedCore/seam';

/**
 * One story entry of a run, as the core writes it, with its `sherloParameters` typed as the story
 * declares them. The seam keeps that one field loose, because it names no type of the SDK's.
 */
export type Snapshot = Omit<SnapshotTheCoreWrites, 'sherloParameters'> & {
  sherloParameters?: SherloParameters;
};

export interface SherloParameters {
  /**
   * Module Mocking (SHERLO-1734): the mocks this story declares, applied for the duration
   * of the story's snapshot. Each is made by `mock(() => import('...'), definition)`, which
   * names the module by its import so the definition is checked against that module's own
   * types. The import's specifier must be a string literal so the config-time Metro scan can
   * see it and emit the shim that makes the module mockable.
   *
   * The older form - an object keyed by module-specifier strings - is still accepted, and
   * stays untyped. Deny-listed modules (react, react-native, @storybook/*, @sherlo/*) cannot
   * be mocked - mock a wrapper module you own instead.
   */
  mocks?: StoryMocks;

  /**
   * Setting exclude to true skips the story during testing. This might be
   * useful if the story has animations that cannot be stabilized for testing
   * or the component behaves in less predictable ways.
   */
  exclude?: boolean;

  /**
   * Setting disableScrollCapture to true will force a single viewport snapshot of the story,
   * even if the content is scrollable. By default, Sherlo automatically captures scrollable
   * content as a stitched long screenshot.
   */
  disableScrollCapture?: boolean;

  /**
   * You can supply figmaUrl parameter with an URL to figma frame that contains
   * designs for this specific component. If supplied it can be viewed during
   * review to easily compare the implementation with designs and detect any
   * differences.
   */
  figmaUrl?: string;

  /**
   * Setting platform parameter to either android or ios tests the story only
   * for that specific platform. By default, Sherlo tests all stories on all
   * platforms specified in sherlo.config.json.
   */
  platform?: 'ios' | 'android';
}

/**
 * What a scene waits for before it is photographed: the `ready` of a scene (src/scenes).
 *
 * The screen's stillness check waits until a view carrying each `testID` is on screen and drawn,
 * every view named in `gone` is gone, and - unless `requestsIdle` is false - no request the screen
 * made through fetch or XMLHttpRequest is still on its way. A scene not ready within `timeoutMs`
 * (30000 by default) fails, naming what was missing.
 *
 * A view is gone once it is not in the native view tree, or is there but invisible: its own or an
 * ancestor's is hidden or near-transparent, or it has no width or height. An animated opacity
 * counts. A view past the inspector's depth or node limit cannot be seen at all and reads as gone;
 * the failure line names such views.
 *
 * A screen with no testID is named as a tap names its target: by the `text` a Text view shows
 * (the whole string, trimmed; typed and typographic quote marks count as the same) or by the
 * accessibility `label` of a view. Each is ready once such a view is drawn on screen. `gone` names
 * testIDs only.
 *
 *   ready: { testID: 'discover.card', gone: 'splash-screen' }
 *   ready: { text: 'Discover' }
 */
export interface ReadyRule {
  testID?: string | string[];
  text?: string | string[];
  label?: string | string[];
  gone?: string | string[];
  timeoutMs?: number;
  requestsIdle?: boolean;
}

/**
 * What the native view tree says of one view named by testID: `visible` (drawn), `invisible`
 * (in the tree but hidden, transparent or empty, itself or by an ancestor), `absent` (the whole
 * tree was walked and it is not in it), or `unreached` (the walk stopped at the inspector's depth
 * or node limit before finding it, so nothing can be said).
 */
export type ViewVisibility = Record<string, 'visible' | 'invisible' | 'absent' | 'unreached'>;

export type StorybookView = View;

type StorybookParamsRaw = Parameters<StorybookView['getStorybookUI']>[0];
export type StorybookParams = StorybookParamsRaw extends infer U
  ? U extends undefined
    ? never
    : U
  : never;

/**
 * Mode reported by the native SherloModule.
 *
 * - `'default'` - Normal app mode. Storybook is not displayed.
 * - `'storybook'` - User activated Storybook via Dev Menu toggle or `openStorybook()`.
 * - `'testing'` - Sherlo is running automated visual tests on a simulator.
 *
 * Use `isStorybookMode` (true when `'storybook'` or `'testing'`) to decide whether
 * to render Storybook, and `isRunningVisualTests` (true only for `'testing'`) when
 * you need to disable animations or mock data during test runs.
 */
export type StorybookViewMode = 'testing' | 'default' | 'storybook';

/**
 * What the real phone did for one story during a capture: every call to native code, every event a
 * native view sent back, the commits, the moment of the picture and the roads it could not record.
 * The quick check replays it. No library is named in it. Every order number counts from 0 across
 * calls, events, commits and blind roads together.
 */
export type StoryRecording = {
  /** The blind roads the story touched: any one makes the story captured, never vouched for. */
  blindRoads: RecordedBlindRoad[];
  /** The order numbers at which React committed the tree, in order. */
  commits: number[];
  /** Every native module call the story made, in the order made. */
  nativeCalls: RecordedNativeCall[];
  /** The order number at which the picture was taken: a call with a higher number is marked `afterPicture`. */
  pictureAt: number;
  /** The story's id as Storybook names it. */
  storyId: string;
  /** Every event a native view sent to JS during the story, in the order sent. */
  viewEvents: RecordedViewEvent[];
};

/** One call from JS to a native module, with what native answered. */
export type RecordedNativeCall = {
  /** True when the call came after the picture was taken. */
  afterPicture: boolean;
  /** The arguments as the call passed them, written as plain JSON values. */
  args: unknown[];
  /** Whether the call returned at once (`sync`) or answered later (`async`: a promise or a callback). */
  kind: 'async' | 'sync';
  /** The module's method that was called. */
  method: string;
  /** The native module's name as the app asked for it. */
  module: string;
  /** This event's place in the recording's one order. */
  order: number;
  /** What native returned, or what the promise resolved with; none when it threw. */
  answer?: unknown;
  /** The callbacks native called, each with the index of the argument it was and what it was given. */
  callbacks?: { args: unknown[]; arg: number }[];
  /** The error native threw or the promise rejected with, as a plain JSON value. */
  threw?: unknown;
};

/** One event a native view sent to JS. */
export type RecordedViewEvent = {
  /** The native view's component name, as the app's tree holds it. */
  component: string;
  /** The event as native names it. */
  event: string;
  /** This event's place in the recording's one order, so its place among the commits is known. */
  order: number;
  /** What the event carried, as a plain JSON value. */
  payload: unknown;
  /** The view's place under the story's root: the child index at each level down; null when outside the story. */
  place: number[] | null;
};

/** A road native code can be reached by that the recorder cannot write down. */
export type RecordedBlindRoad = {
  /** What kind of road it was: a worklet runtime, a global a library installed, an Expo call that skipped the usual lookup, or an Expo native event. */
  kind: 'expoNativeEvent' | 'expoSkippedLookup' | 'jsiGlobal' | 'workletRuntime';
  /** This road's place in the recording's one order. */
  order: number;
  /** The global's or the module's name, when there is one. */
  name?: string;
};
