import {
  activateMocks,
  activeMockLookups,
  isMockingModeActive,
  MOCKED_MODULE_ERROR_NAME,
  MockLookups,
  wasBuiltBeforeMock,
} from './registry';
import { privateCopiesHandedByBundler } from './stillReal';
import { MockSet } from './types';
import { CLOCK_MOCK_KEY, ClockDefinition, installClock, restoreClock } from './clock';
import { RANDOM_MOCK_KEY, RandomDefinition, installRandom, restoreRandom } from './random';
import { bundlerSawModule } from './declaredImports';
import type { StoryError } from '../sealedCore/seam';

// Reads the clock/random declarations back off the same channel a module mock rides in on
// (mockClock/mockRandom), installs or restores each, and returns the remaining module mocks.
// Gated on the same mode activateMocks itself gates on, so a shipped app installs neither.
function applyClockAndRandom(mocks: MockSet): MockSet {
  const { [CLOCK_MOCK_KEY]: clock, [RANDOM_MOCK_KEY]: random, ...moduleMocks } = mocks;
  const active = isMockingModeActive();

  if (active && clock) installClock((clock as unknown as ClockDefinition).moment);
  else restoreClock();

  if (active && random) installRandom((random as unknown as RandomDefinition).seed);
  else restoreRandom();

  return moduleMocks;
}

// Installs `mocks` as the active set for one story, replacing whatever was active before.
// `lookups` is the story's record of what its reads met (see MockLookups in ./registry): a mock
// that did not take effect is known only once the story has rendered, so nothing is said here.
export function activateStoryMocks(mocks: MockSet, lookups?: MockLookups): void {
  activateMocks(applyClockAndRandom(mocks), lookups);
}

/**
 * Why `storyId`'s mocks did not take effect, or undefined when they did - or when they are not the
 * mocks in effect. Read with the story's own errors (../getStorybook/storyErrorRegistry), so the
 * core reports it as what the story threw.
 *
 * It is worked out at each read, never stored: the core reads a story's errors while it waits for
 * the story's views too, and under inlineRequires a module is first required while the story
 * renders, so an answer kept from before the story settled would fail a mock that applies. After
 * the story settled, a mock the story or its file declares that no read reached has reached
 * nothing; a project mock no read reached is a default the story did not need.
 */
export function mockFailureOf(storyId: string): StoryError | undefined {
  const active = activeMockLookups();
  if (!active || active.lookups.storyId !== storyId) return undefined;

  const { mocks, lookups } = active;
  const sentences = Object.keys(mocks).flatMap((key) => {
    const name = lookups.namesAsWritten.get(key) ?? key;
    const thrown = lookups.realImportThrew.get(key);
    if (thrown !== undefined) {
      return [`${name} could not be mocked: its real import threw "${thrown}"`];
    }
    if (!bundlerSawModule(key)) {
      return [
        `the mock of ${name} did not apply: the bundler had not seen this module when it started - restart the bundler`,
      ];
    }
    if (lookups.declaredByStory.has(key) && !lookups.reached.has(key)) {
      const owners = privateCopiesHandedByBundler(key);
      if (owners.length > 0) {
        return [
          `the mock of ${name} did not apply: ${owners.join(' and ')} has its own copy of it in its node_modules, and a mock reaches only the app's copy`,
        ];
      }
      if (wasBuiltBeforeMock(key)) {
        return [
          `the mock of ${name} did not apply: the module was built before the mock was on - an instance made as the module loads keeps the real one`,
        ];
      }
      return [`the mock of ${name} did not apply: nothing in the story imported it`];
    }
    return [];
  });
  if (sentences.length === 0) return undefined;

  return {
    name: MOCKED_MODULE_ERROR_NAME,
    message: sentences.join('\n'),
    stack: '',
    componentStack: '',
  };
}

export default activateStoryMocks;
