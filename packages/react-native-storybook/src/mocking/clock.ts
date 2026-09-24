import { MockDeclaration } from './mockDeclaration';
import { MockDefinition } from './types';

// No real module is ever imported under this key, so a clock declaration can never collide
// with a module mock - it rides the same declaration channel `mock` uses, then activateStoryMocks
// reads it back off that channel and installs the clock instead of a module.
export const CLOCK_MOCK_KEY = '__sherlo_clock__';

export interface ClockDefinition {
  moment: string | number | Date;
}

/**
 * Declares the moment a story's clock should read.
 *
 *   mocks: [mockClock('2020-01-02T03:04:05.000Z')]
 */
export function mockClock(moment: string | number | Date): MockDeclaration {
  return {
    moduleKey: () => Promise.resolve(CLOCK_MOCK_KEY),
    definition: { moment } as MockDefinition,
  };
}

let RealDate: DateConstructor | undefined;
let frozenMoment: number;

// Replaces global.Date with a subclass whose no-argument construction and Date.now() read the
// frozen moment; construction with arguments still builds a real Date. The moment is stored once,
// so it does not advance while the story is active.
export function installClock(moment: string | number | Date): void {
  RealDate = RealDate ?? global.Date;
  frozenMoment = new RealDate(moment).getTime();
  const OriginalDate = RealDate;

  class FrozenDate extends OriginalDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) {
        super(frozenMoment);
      } else {
        // @ts-expect-error - forwarding to the real Date constructor with the caller's own args
        super(...args);
      }
    }

    static now(): number {
      return frozenMoment;
    }
  }

  global.Date = FrozenDate as DateConstructor;
}

// Restores the real Date, if a clock was ever installed.
export function restoreClock(): void {
  if (!RealDate) return;
  global.Date = RealDate;
  RealDate = undefined;
}
