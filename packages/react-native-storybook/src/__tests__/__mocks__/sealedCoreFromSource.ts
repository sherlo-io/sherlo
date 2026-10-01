/**
 * THE CORE THE SDK SUITE RUNS AGAINST: the sealed core built from the core package's own source
 * (packages/sherlo-core/js/src), not a scrambled build of it. For the SDK's suite only.
 *
 * Importing the source puts the core on __SHERLO_CORE__. It is also kept aside, because a test may
 * delete that global before the SDK loads again. The react-native stub's loadCore hands back
 * `sourceThatPutsTheCoreFromSourceOnTheGlobal` unless a test chose another answer
 * (__setNativeLoadCore), so the SDK evaluates, checks and installs this core the way an app does
 * the shipped one.
 *
 * Every fresh import of the SDK (vi.resetModules) imports this file, and so the core, afresh: each
 * copy of the SDK a test loads gets a core of its own, installed with that copy's host.
 */
import '../../../../sherlo-core/js/src/index';

const KEPT_ASIDE = '__sherloTestCoreFromSource';

(globalThis as Record<string, unknown>)[KEPT_ASIDE] = globalThis.__SHERLO_CORE__;

/** The source native code hands over: its header line, then the core kept aside, put back. */
export const sourceThatPutsTheCoreFromSourceOnTheGlobal = [
  '// sherlo-core {"version":"0.0.0-source","seam":1}',
  `globalThis.__SHERLO_CORE__ = globalThis.${KEPT_ASIDE};`,
].join('\n');
