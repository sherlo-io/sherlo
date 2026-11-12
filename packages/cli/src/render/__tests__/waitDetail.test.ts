import chalk from 'chalk';
import { beforeAll, expect, it } from 'vitest';
import { renderRunFailure, type RunFailure } from '../waitDetail';

beforeAll(() => {
  (chalk as unknown as { level: number }).level = 0;
});

const failure: RunFailure = {
  stage: 'build',
  device: 'iphone.15 (iOS 17)',
  cause: 'the build broke',
  reference: 'ref-1',
  retried: false,
};

it('a failed run with no stage and no phone prints only its cause', () => {
  expect(renderRunFailure({ ...failure, stage: null, device: null })[0]).toBe(
    'It failed: the build broke'
  );
});

it('a failed run names the stage and the phone it knows, and leaves out the one it does not', () => {
  expect(renderRunFailure(failure)[0]).toBe(
    'It failed at the build stage on iphone.15 (iOS 17): the build broke'
  );
  expect(renderRunFailure({ ...failure, device: null })[0]).toBe(
    'It failed at the build stage: the build broke'
  );
  expect(renderRunFailure({ ...failure, stage: null })[0]).toBe(
    'It failed on iphone.15 (iOS 17): the build broke'
  );
});
