import { describe, expect, expectTypeOf, it } from 'vitest';
import type { DiagnosticType } from '../types';

describe('DiagnosticType', () => {
  it('a diagnostic is one of the android window dump and the stabilization frames', () => {
    // Pinned by the type check (`yarn typecheck`): the rescue switch that swapped the app's root
    // for Storybook is gone, so no third name belongs here.
    expectTypeOf<DiagnosticType>().toEqualTypeOf<'androidWindowDump' | 'stabilizationFrames'>();

    const everyDiagnostic: Record<DiagnosticType, true> = {
      androidWindowDump: true,
      stabilizationFrames: true,
    };
    expect(Object.keys(everyDiagnostic).sort()).toEqual(['androidWindowDump', 'stabilizationFrames']);
  });
});
