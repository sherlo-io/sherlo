/**
 * THE SEALED JS CORE - the readable source. It never ships like this: build.js minifies and
 * scrambles it into sherlo-core.js, the file the SDK's native loader hands back.
 *
 * It imports nothing at runtime: no React, no React Native. Everything it reaches comes through
 * the host the SDK hands its install (typed by the SDK's seam, a type-only import erased at build).
 * It puts one global, __SHERLO_CORE__, which the SDK calls into (src/sealedCore/loadSealedCore.ts).
 *
 * This core is the empty shell: version, seam, and an install that stores the host. Later tasks
 * move the story walk, the readiness steps and the capture driver in here, behind this same seam.
 */
import type { SealedCore, SealedCoreHost } from '../../../react-native-storybook/src/sealedCore/seam';

// build.js defines this as the SDK's version from lerna.json.
declare const __SHERLO_CORE_VERSION__: string;
const VERSION = __SHERLO_CORE_VERSION__;

// The number of the contract this core speaks (SEAM_THIS_SDK_SPEAKS in the SDK's loadSealedCore).
const SEAM = 1;

// Everything the SDK handed this core, kept for the walk, readiness and capture later tasks add.
let installedHost: SealedCoreHost | undefined;

function storeHost(host: SealedCoreHost): void {
  installedHost = host;
  // `void` marks the store as deliberate until a later task reads it; it ships nothing.
  void installedHost;
}

const core: SealedCore = {
  version: VERSION,
  seam: SEAM,
  install: storeHost,
};

(globalThis as { __SHERLO_CORE__?: SealedCore }).__SHERLO_CORE__ = core;
