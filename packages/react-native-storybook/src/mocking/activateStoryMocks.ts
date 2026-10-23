import {
  activateMocks,
  activeMockLookups,
  isMockingModeActive,
  MOCKED_MODULE_ERROR_NAME,
  MockLookups,
} from './registry';
import { MockSet } from './types';
import { CLOCK_MOCK_KEY, ClockDefinition, installClock, restoreClock } from './clock';
import { RANDOM_MOCK_KEY, RandomDefinition, installRandom, restoreRandom } from './random';
import { bundlerSawModule } from './declaredImports';
import SherloModule from '../SherloModule';
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
 * renders, so an answer kept from before the story settled would fail a mock that applies.
 *
 * A MOCK NO READ REACHED FAILS NOTHING UNTIL THE STORY SETTLED. A whole-app story's app imports
 * its mocked modules as it boots, seconds after activation - after the core's wait for the story's
 * views and the ready wait's first poll have read this - so in testing mode it is judged only once
 * the story's screen was (MockLookups' `settled`: its stillness check ran, or its ready wait ran
 * out). Then a mock the story or its file declares that no read reached has reached nothing; a
 * project mock no read reached is a default the story did not need. Outside testing mode no
 * stillness check runs, and it is judged at each read. A real import that threw, and a module the
 * bundler never saw, fail the story from the first read: neither changes as the app renders.
 */
export function mockFailureOf(storyId: string): StoryError | undefined {
  const active = activeMockLookups();
  if (!active || active.lookups.storyId !== storyId) return undefined;

  const { mocks, lookups } = active;
  const judgeUnreached = lookups.settled || SherloModule.getMode() !== 'testing';
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
    if (judgeUnreached && lookups.declaredByStory.has(key) && !lookups.reached.has(key)) {
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
