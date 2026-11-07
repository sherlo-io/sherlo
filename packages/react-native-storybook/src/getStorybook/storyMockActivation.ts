/**
 * The one path that installs ONE story's merged mock set. Sherlo's decorator
 * (./sherloAnnotation) calls it for every story Storybook is about to render, in testing mode and
 * Storybook mode alike, and the sealed core reaches it through its host.
 *
 * Its three levels - the project's, the file's and the story's - all come from what Storybook's
 * start() was handed (../mocking/storyMocksOf), so they are all there on the first pass.
 *
 * A scene's mocks, which no Storybook knows, are installed through the same path by the early-boot
 * module (../sceneBoot), from the scene's own file.
 */
import { storyMockLevelsOf } from '../mocking/storyMocksOf';
import { mergeStoryMocks } from '../mocking/mergeMocks';
import { mergeDefinitions, mergeMockSets } from '../mocking/mergeDefinitions';
import {
  declarationsOf,
  isModuleDeclaration,
  MockDeclaration,
  StoryMocks,
} from '../mocking/mockDeclaration';
import {
  activateNetworkMocks,
  activateStoryMocks,
  networkMocksOf,
  resolveDeclarations,
  UnmockedRequestError,
} from '../mocking';
import { MockLookups, newMockLookups } from '../mocking/registry';
import { startStillRealStory } from '../mocking/stillReal';
import { storyAboutToRender } from '../storyReady';
import { namesAsWrittenOf, standInKeyAtBundlerStart } from '../mocking/declaredImports';
import { MockSet } from '../mocking/types';
import type { StartState } from '../mocking/startState';
import type { PreconditionParts } from '../preconditions';
import { recordStoryError } from './storyErrorRegistry';
import { readStorybookFacts } from './storybookFacts';

// The record of what the reads of the story on screen met. It is kept across activations of the
// same story: Storybook does not render a story again when it is selected while already on screen,
// so a second capture of it in a row reads nothing, and a fresh record would call its mocks
// unreached. Activating another story starts a fresh one.
let lookupsOnScreen: MockLookups | undefined;

// Monotonic id for the latest attempt to install a story's mocks. A declaration names its
// module by import, so its name is only known once that import resolves - and an attempt whose
// resolution finishes after a newer attempt has already installed must not overwrite it.
let latestInstall = 0;
// What the latest attempt answered: what a superseded attempt hands its caller to wait on instead.
let latestInstalled: Promise<void> | null = null;

// The scene this launch switched on at boot (../sceneBoot), whose mocks stay on for the launch.
let sceneOnSinceBoot: string | undefined;
// The start states the scene's `given` list names, in list order.
let startStatesOfScene: StartState[] = [];

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
  const installed = installedMocksOf(storyId);
  // Whatever is about to be photographed is proven ready afresh first, and its steps and its
  // stillness check wait for the promise returned here (../storyReady): the steps were skipped in
  // 2 of 27 captures when they only ran after the call.
  storyAboutToRender(storyId, installed);
  return installed;
}

function installedMocksOf(storyId: string): Promise<void> | null {
  // A scene's mocks went on before the app's first module, and its launch shows that scene alone:
  // activating it again would install what Storybook knows of it, which is nothing.
  if (storyId === sceneOnSinceBoot) return latestInstalled;

  const { project, own = {} } = storyMockLevelsOf(storyId);
  const storyFilePath = readStorybookFacts()?.storyIndex[storyId]?.importPath;
  return installMergedMocks(storyId, mergeStoryMocks(project, own), own, storyFilePath);
}

/**
 * Install the launched scene's preconditions - its `given` list, flattened (../preconditions) - at
 * boot, before the app's first module runs (../sceneBoot): the fakes and request fakes, merged in
 * list order with a later one winning, and then the start states, in list order, inside the same
 * activation so clearing the mocks undoes them. Every module mock whose stand-in the bundler's scan
 * named when it started is in effect when this returns: no import is waited for, as a module that
 * reads a mocked module as it loads runs straight after. The declarations are then resolved as a
 * story's are, which names an import that reached no stand-in in the scene's failure.
 */
export function activateSceneMocks(
  sceneId: string,
  parts: PreconditionParts[],
  sceneFilePath: string
): void {
  sceneOnSinceBoot = sceneId;
  startStatesOfScene = parts.flatMap((part) => part.startStates ?? []);
  const withMocks = parts.filter((part) => part.mocks !== undefined);
  // The scene file's own entries are what the scene must reach: a shared precondition's fakes are
  // defaults, which a scene may leave alone.
  const ownMocks = foldMocks(withMocks.filter((part) => part.origin !== 'shared'));
  const mocks = foldMocks(withMocks);
  if (Array.isArray(mocks) || Array.isArray(ownMocks)) {
    const known = withMocks.map((part) => knownAtBundlerStart(part.mocks ?? {}, sceneFilePath));
    const ownKnown = knownAtBundlerStart(ownMocks, sceneFilePath);
    installMocksOfStory(sceneId, mergeMockSets(...known), Object.keys(ownKnown), sceneFilePath);
  }
  // Each lazily imported mock is a split bundle of its own, and its landing loads the module it
  // mocks. The scene's first step waits for them all (../playSteps, ../storyReady), so none lands
  // while a step opens a screen.
  storyAboutToRender(sceneId, installMergedMocks(sceneId, mocks, ownMocks, sceneFilePath));
}

// The mocks of `parts` in list order, a later part winning over an earlier one.
function foldMocks(parts: PreconditionParts[]): StoryMocks {
  return parts.reduce<StoryMocks>((merged, part) => mergeStoryMocks(merged, part.mocks), {});
}

// The mocks of one level whose module's name is known with no import waited for: an object names
// its modules as its keys, a list only by the scan's record of each stand-in.
function knownAtBundlerStart(mocks: StoryMocks, filePath: string): MockSet {
  return Array.isArray(mocks) ? moduleMocksKnownAtBundlerStart(mocks, filePath) : mocks;
}

// Each module mock of `declarations` whose stand-in's name the scan recorded, by that name, and
// each that names its key itself (the clock, the random numbers); a later declaration of the same
// module wins, as resolveDeclarations has it.
function moduleMocksKnownAtBundlerStart(
  declarations: MockDeclaration[],
  filePath: string
): MockSet {
  const mocks: MockSet = {};
  declarations.filter(isModuleDeclaration).forEach((declaration) => {
    const { specifierAsWritten, keyAtDeclaration, definition } = declaration;
    const key =
      keyAtDeclaration ??
      (specifierAsWritten === undefined
        ? undefined
        : standInKeyAtBundlerStart(specifierAsWritten, filePath));
    if (key) mocks[key] = key in mocks ? mergeDefinitions(mocks[key], definition) : definition;
  });
  return mocks;
}

// Installs `mocks`, the merged set of `storyId`, as activateMocksForStory says, each mocked module
// named as `filePath` wrote it. `own` is the part of them the story itself declares, which is
// failed for reaching nothing.
function installMergedMocks(
  storyId: string,
  mocks: StoryMocks,
  own: StoryMocks,
  filePath: string | undefined
): Promise<void> | null {
  // Like the requests no rule answered, the list of app modules the story ran as real code starts
  // empty on every activation: a second capture of an unchanged story renders nothing again, so
  // it lists neither.
  startStillRealStory();

  const install = (latestInstall += 1);

  // Network rules are plain values the story wrote, so they are in effect at once - no import to
  // wait for. A story that declares none puts the real fetch and XMLHttpRequest back.
  activateNetworkMocks(networkMocksOf(mocks), (refusal) => recordRefusal(storyId, refusal));

  // The object form already names every module it mocks, so it installs at once.
  // (Every level is then the object form, the story's own part too.)
  if (!Array.isArray(mocks)) {
    installMocksOfStory(storyId, mocks, Object.keys(own), filePath);
    latestInstalled = null;
    return null;
  }

  // An attempt a newer one overtook installs nothing, and settles only once the newer one has
  // installed: its caller - Sherlo's decorator, say - renders the story when it settles, and a
  // story rendered before then reads the real module. On a dev server each attempt's import
  // fetches its own lazy bundle, so the newer attempt's can arrive after the first attempt's.
  // The own part resolves apart too, so the names the story itself declares are known; a later
  // declaration of a module wins over an earlier one, as the merge has it.
  // A lazy declaration's import is a fetch, so each declaration is asked its module once, though
  // both the whole set and the own part read it.
  const askedOnce = new Map<MockDeclaration, Promise<string | undefined>>();
  const importingOnce = (declaration: MockDeclaration): MockDeclaration => {
    if (!isModuleDeclaration(declaration)) return declaration;
    return {
      ...declaration,
      moduleKey: () => {
        if (!askedOnce.has(declaration)) askedOnce.set(declaration, declaration.moduleKey());
        return askedOnce.get(declaration) as Promise<string | undefined>;
      },
    };
  };
  latestInstalled = Promise.all([
    resolveDeclarations(declarationsOf(mocks).map(importingOnce)),
    resolveDeclarations(declarationsOf(own).map(importingOnce)),
  ]).then(([resolved, ownResolved]) => {
    if (install !== latestInstall) return latestInstalled ?? undefined;
    installMocksOfStory(storyId, resolved, Object.keys(ownResolved), filePath);
  });
  return latestInstalled;
}

// Installs `mocks` for `storyId` with the story's record of what its reads met, each mocked module
// named as its file, `filePath`, wrote it, and `declaredByStory` the keys the story or its file
// declare.
function installMocksOfStory(
  storyId: string,
  mocks: MockSet,
  declaredByStory: string[],
  filePath: string | undefined
): void {
  const lookups = lookupsOnScreen?.storyId === storyId ? lookupsOnScreen : newMockLookups(storyId);
  lookupsOnScreen = lookups;
  lookups.declaredByStory = new Set(declaredByStory);
  namesAsWrittenOf(filePath, Object.keys(mocks)).forEach((name, key) =>
    lookups.namesAsWritten.set(key, name)
  );
  activateStoryMocks(mocks, lookups);
  // Inside the activation just made, so the mocks' clearing puts back what these write; and again
  // with each install of the scene, since each one ends the activation before it.
  if (storyId === sceneOnSinceBoot) startStatesOfScene.forEach((state) => state.activate());
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
