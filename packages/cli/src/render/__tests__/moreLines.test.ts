import chalk from 'chalk';
import { beforeAll, expect, it } from 'vitest';
import { moreLines } from '../moreLines';

beforeAll(() => {
  (chalk as unknown as { level: number }).level = 0;
});

it('moreLines prints the left-out count as one indented line, and nothing when none was left out', () => {
  expect(moreLines(3)).toEqual(['  ... and 3 more']);
  expect(moreLines(0)).toEqual([]);
});
