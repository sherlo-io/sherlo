/**
 * The one path that installs ONE story's merged mock set. Sherlo's decorator
 * (./sherloAnnotation) calls it for every story Storybook is about to render, in testing mode and
 * Storybook mode alike, and the sealed core reaches it through its host.
 *
 * Its three levels - the project's, the file's and the story's - all come from what Storybook's
 * start() was handed (../mocking/storyMocksOf), so they are all there on the first pass.
 */
import { storyMocksOf } from '../mocking/storyMocksOf';
import {
  activateNetworkMocks,
  installStoryMocks,
  networkMocksOf,
  resolveDeclarations,
  unreachedMocksOfActiveStory,
  UnmockedRequestError,
  warnUnnamedImports,
} from '../mocking';
import type { StoryError } from '../sealedCore/seam';
import { activeMockKeys } from '../mocking/registry';
import { UnansweredRequest, unansweredRequests } from '../mocking/networkRules';
import { declaredImportsOf } from '../mocking/declaredImports';
import { isUnshimmedImportName, UNSHIMMED_IMPORT_PREFIX } from '../mocking/mockDeclaration';
import { readStorybookFacts } from './storybookFacts';
import { readStoryError, recordStoryError } from './storyErrorRegistry';

// The story whose mocks are installed, which is the only story an unreached mock can fail.
let installedStoryId: string | undefined;

// Monotonic id for the latest attempt to install a story's mocks. A declaration names its
// module by import, so its name is only known once that import resolves - and an attempt whose
// resolution finishes after a newer attempt has already installed must not overwrite it.
let latestInstall = 0;
// What the latest attempt answered: what a superseded attempt hands its caller to wait on instead.
let latestInstalled: Promise<void> | null = null;

/**
 * Install `storyId`'s merged mocks, and say when they ARE installed: null when that has already
 * happened - the object form, and a story with no mocks at all - or the promise that settles
 * once it has, for declarations, whose modules are only named once their imports resolve.
 *
 * THE STORY MUST NOT RENDER WHILE THAT PROMISE IS OUTSTANDING. A story that renders first reads
 * the real module, and a capture that renders once and never again would record the real value.
 * Sherlo's decorator renders the story only once the promise settles.
 */
export function activateMocksForStory(storyId: string | undefined): Promise<void> | null {
  if (!storyId) return null;

  const mocks = storyMocksOf(storyId);
  const install = (latestInstall += 1);

  // Network rules are plain values the story wrote, so they are in effect at once - no import to
  // wait for. A story that declares none puts the real fetch and XMLHttpRequest back.
  activateNetworkMocks(networkMocksOf(mocks), (refusal) => recordRefusal(storyId, refusal));

  // The object form already names every module it mocks, so it installs at once.
  if (!Array.isArray(mocks)) {
    installStoryMocks(mocks);
    installedStoryId = storyId;
    latestInstalled = null;
    return null;
  }

  // An attempt a newer one overtook installs nothing, and settles only once the newer one has
  // installed: its caller - Sherlo's decorator, say - renders the story when it settles, and a
  // story rendered before then reads the real module. On a dev server each attempt's import
  // fetches its own lazy bundle, so the newer attempt's can arrive after the first attempt's.
  latestInstalled = resolveDeclarations(mocks).then((resolvedMocks) => {
    if (install !== latestInstall) return latestInstalled ?? undefined;
    installStoryMocks(resolvedMocks);
    installedStoryId = storyId;
    warnUnnamedImports(resolvedMocks);
  });
  return latestInstalled;
}

/**
 * SPIKE still-real-list: the requests the active story made that no rule answered - refused, or
 * let through to the real network - read, like the story's failure, once it has rendered and
 * settled. The capture would carry it beside `threw`.
 */
export function unansweredRequestsOfStory(): UnansweredRequest[] {
  return unansweredRequests();
}

/**
 * What the core reads for a story once it has rendered and settled: the error the story threw, or
 * - when it threw none - the failure of a mock that reached nothing.
 *
 * This is the one moment a mock that reached nothing is certain. The mock is installed before the
 * story renders and every import its declaration awaited has settled, yet a module the story uses
 * may still be required for the first time while it renders (inlineRequires), so neither the
 * install nor the shims evaluated by then can say it: only a story that has rendered and read none
 * of the module's exports has reached nothing. The failure names the mocks as the story named them.
 */
export function storyFailureOf(storyId: string): StoryError | undefined {
  const thrown = readStoryError(storyId);
  if (thrown || storyId !== installedStoryId) return thrown;

  const unreached = unreachedMocksOfActiveStory();
  if (unreached.length === 0) return undefined;

  const unnamed = unreached.filter(isUnshimmedImportName);
  const named = unreached.filter((key) => !isUnshimmedImportName(key));
  const sentences: string[] = [];

  if (named.length > 0) {
    const names = named.map((name) => `"${name}"`).join(', ');
    const pronoun = named.length > 1 ? 'them' : 'it';
    sentences.push(
      `the story mocks ${names}, but nothing it rendered used ${pronoun}, so the mock ` +
        `reached nothing. Check that the story renders a component that imports ${pronoun}, and ` +
        'that the name matches what the app imports (restart Metro after adding a key).'
    );
  }

  sentences.push(...unnamed.map((key) => unreachedImportSentence(key, storyId)));

  return {
    name: 'UnreachedMockError',
    message: `Sherlo: ${sentences.join(' Sherlo: ')}`,
    stack: '',
    componentStack: '',
  };
}

// A declaration whose import settled on a module that is no stand-in has no name of its own. The
// scan's manifest of what the story's file imports for a mock (../mocking/declaredImports) names
// the module, except those another declaration of the story already named by its stand-in.
function unreachedImportSentence(unnamedKey: string, storyId: string): string {
  const importPath = readStorybookFacts()?.storyIndex[storyId]?.importPath;
  const namedKeys = activeMockKeys();
  const candidates = importPath
    ? declaredImportsOf(importPath).filter((specifier) => !namedKeys.includes(specifier))
    : [];
  const declaring = unnamedKey.replace(UNSHIMMED_IMPORT_PREFIX, '');
  const where =
    candidates.length === 0
      ? `a module whose name Sherlo's build did not record (${declaring})`
      : `the module imported as ${candidates.map((c) => `"${c}"`).join(' or ')} in ${importPath} (${declaring})`;

  return (
    `the story declares a mock for ${where}, but that import reached no stand-in, so the ` +
    'bundler did not redirect it and the mock reached nothing. Check that the name resolves ' +
    'for the app as it does for the story (alias, extension) and restart Metro.'
  );
}

/**
 * A request no rule matched is recorded exactly the way a render error is, in the one registry the
 * error boundary fills (./storyErrorRegistry). That is what makes the capture and the test run
 * both report the story as one that threw, with the refusal's own name and message: there is ONE
 * way of knowing a story is broken in this SDK, and a refused request is another writer of it.
 *
 * This is also the only place a refusal meets a story: the interceptor itself knows nothing but
 * the rules in effect.
 */
function recordRefusal(storyId: string, refusal: UnmockedRequestError): void {
  recordStoryError(storyId, {
    name: refusal.name,
    message: refusal.message,
    stack: refusal.stack ?? '',
    componentStack: '',
  });
}
