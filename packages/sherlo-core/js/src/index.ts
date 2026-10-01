/**
 * THE SEALED JS CORE - the readable source. It never ships like this: build.js minifies and
 * scrambles it into sherlo-core.js, the file the SDK's native loader hands back.
 *
 * It imports nothing at runtime: no React, no React Native. Everything it reaches comes through
 * the host the SDK hands its install (./host, typed by the SDK's seam, a type-only import erased at
 * build). It puts one global, __SHERLO_CORE__, which the SDK calls into
 * (src/sealedCore/loadSealedCore.ts).
 *
 * It holds the SDK's know-how: how it lists stories, shapes the list the runner is sent, reads the
 * inspector's tree and walks the app's components, and a test run's walk - starting the session,
 * waiting for each story to be ready, and reporting it. A later task moves the capture driver in
 * here, behind this same seam.
 */
import type { SealedCore } from '../../../react-native-storybook/src/sealedCore/seam';
import { installHost } from './host';
import { enumerateStories } from './adapter';
import prepareSnapshots from './prepareSnapshots';
import { prepareInspectorData } from './prepareInspectorData';
import { mergeGenerations } from './metadataWalk';
import { componentNamesByNativeTag, primitiveOfHostType } from './componentNames';
import { startTestSession } from './startTestSession';
import { testStory } from './testStory';
import {
  __resetStoryRenderedTrackingForTests,
  lastRenderedStory,
  startStoryRenderedTracking,
  waitForStoryRendered,
} from './storyRenderedReadiness';

// build.js defines this as the SDK's version from lerna.json.
declare const __SHERLO_CORE_VERSION__: string;
const VERSION = __SHERLO_CORE_VERSION__;

// The number of the contract this core speaks (SEAM_THIS_SDK_SPEAKS in the SDK's loadSealedCore).
const SEAM = 1;

const core: SealedCore = {
  version: VERSION,
  seam: SEAM,
  install: installHost,
  enumerateStories,
  prepareSnapshots,
  prepareInspectorData,
  mergeGenerations,
  componentNamesByNativeTag,
  primitiveOfHostType,
  startTestSession,
  testStory,
  startStoryRenderedTracking,
  waitForStoryRendered,
  lastRenderedStory,
  __resetStoryRenderedTrackingForTests,
};

(globalThis as { __SHERLO_CORE__?: SealedCore }).__SHERLO_CORE__ = core;
