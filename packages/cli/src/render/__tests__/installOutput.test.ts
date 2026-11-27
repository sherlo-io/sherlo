/**
 * WHICH LINES OF A FAILED PACKAGE INSTALL THE SCREEN SHOWS: each manager's own error lines, read
 * from what that manager really printed for a version that is not published, then a little context.
 */
import { describe, expect, it } from 'vitest';
import type { Agent } from 'package-manager-detector';
import { pickInstallOutput, saysVersionNotPublished } from '../installOutput';

/** pnpm pads its error code with U+2009 thin spaces, the edges of the badge it colours. */
const THIN_SPACE = String.fromCodePoint(0x2009);

/** What each tool printed for a version of `packageName` that is not published. */
const NOT_PUBLISHED_OUTPUT: Array<[Agent, (packageName: string) => string]> = [
  [
    'npm',
    (packageName) =>
      `npm error code ETARGET\nnpm error notarget No matching version found for ${packageName}@^3.\n`,
  ],
  [
    'yarn',
    (packageName) =>
      `yarn add v1.22.22\nerror Couldn't find any versions for "${packageName}" that matches "^3"\n`,
  ],
  [
    'yarn@berry',
    (packageName) =>
      `${JSON.stringify({ type: 'error', name: 82, displayName: 'YN0082', indent: '│ ', data: `${packageName}@npm:^3: No candidates found` })}\n`,
  ],
  [
    'pnpm',
    (packageName) =>
      `${THIN_SPACE}ERR_PNPM_NO_MATCHING_VERSION${THIN_SPACE} No matching version found for ${packageName}@^3 while fetching it from https://registry.npmjs.org/\n`,
  ],
  [
    'bun',
    (packageName) =>
      `bun add v1.4.5\nerror: No version matching "^3" found for specifier "${packageName}" (but package exists)\n`,
  ],
];

describe('the install says Sherlo is not published', () => {
  it.each(NOT_PUBLISHED_OUTPUT)('%s: only when its error line names Sherlo', (tool, output) => {
    const packageName = '@sherlo/react-native-storybook';

    expect(saysVersionNotPublished({ tool, output: output(packageName), packageName })).toBe(true);
    // Another dependency of the project with no matching version is an install that failed.
    expect(
      saysVersionNotPublished({ tool, output: output('react-native-reanimated'), packageName })
    ).toBe(false);
  });
});

describe('the lines a failed install shows', () => {
  it('npm: its error lines, without the complete-log line, and its debug log named', () => {
    const { lines, toolLogFiles } = pickInstallOutput({
      tool: 'npm',
      output: [
        'npm error code ETARGET',
        'npm error notarget No matching version found for @sherlo/react-native-storybook@2.0.2.',
        'npm error A complete log of this run can be found in: /Users/anna/.npm/_logs/2026-11-25T09_00_00_000Z-debug-0.log',
      ].join('\n'),
    });

    expect(lines).toEqual([
      'npm error code ETARGET',
      'npm error notarget No matching version found for @sherlo/react-native-storybook@2.0.2.',
    ]);
    expect(toolLogFiles).toEqual(['/Users/anna/.npm/_logs/2026-11-25T09_00_00_000Z-debug-0.log']);
  });

  it('Yarn 1: its error line, then its context without the documentation link', () => {
    const { lines } = pickInstallOutput({
      tool: 'yarn',
      output: [
        'yarn add v1.22.22',
        '[1/4] Resolving packages...',
        'error Couldn\'t find any versions for "@sherlo/react-native-storybook" that matches "2.0.2"',
        'info Visit https://yarnpkg.com/en/docs/cli/add for documentation about this command.',
      ].join('\n'),
    });

    expect(lines).toEqual([
      'error Couldn\'t find any versions for "@sherlo/react-native-storybook" that matches "2.0.2"',
      'yarn add v1.22.22',
      '[1/4] Resolving packages...',
    ]);
  });

  it('Yarn 4: the error records of its --json report, with no step frames', () => {
    const record = (type: string, displayName: string, data: string) =>
      JSON.stringify({ type, name: 0, displayName, indent: '', data });
    const { lines } = pickInstallOutput({
      tool: 'yarn@berry',
      output: [
        record('info', 'YN0000', '┌ Resolution step'),
        record('error', 'YN0082', '@sherlo/react-native-storybook@npm:2.0.2: No candidates found'),
        record('info', 'YN0000', '└ Completed in 0s 245ms'),
        record('info', 'YN0000', '· Failed with errors in 0s 251ms'),
      ].join('\n'),
    });

    expect(lines).toEqual([
      'YN0082: @sherlo/react-native-storybook@npm:2.0.2: No candidates found',
    ]);
  });

  it('pnpm: its error block, its code padded as its log shows it, without the progress line', () => {
    const { lines } = pickInstallOutput({
      tool: 'pnpm',
      output: [
        'Progress: resolved 1, reused 0, downloaded 0, added 0',
        `${THIN_SPACE}ERR_PNPM_NO_MATCHING_VERSION${THIN_SPACE} No matching version found for @sherlo/react-native-storybook@2.0.2 while fetching it from https://registry.npmjs.org/`,
        '',
        'The latest release of @sherlo/react-native-storybook is "2.0.1".',
      ].join('\n'),
    });

    expect(lines).toEqual([
      'ERR_PNPM_NO_MATCHING_VERSION  No matching version found for @sherlo/react-native-storybook@2.0.2 while fetching it from https://registry.npmjs.org/',
      'The latest release of @sherlo/react-native-storybook is "2.0.1".',
    ]);
  });

  it('Bun: its error line', () => {
    const { lines } = pickInstallOutput({
      tool: 'bun',
      output:
        'bun add v1.4.5\nerror: No version matching "2.0.2" found for specifier "@sherlo/react-native-storybook" (but package exists)',
    });

    expect(lines).toEqual([
      'error: No version matching "2.0.2" found for specifier "@sherlo/react-native-storybook" (but package exists)',
      'bun add v1.4.5',
    ]);
  });

  it('nothing marked as an error: the last 20 lines, as printed', () => {
    const output = Array.from({ length: 25 }, (_, index) => `line ${index + 1}`).join('\n');

    expect(pickInstallOutput({ tool: 'npm', output }).lines).toEqual(
      Array.from({ length: 20 }, (_, index) => `line ${index + 6}`)
    );
  });

  it('a redrawn line keeps only what was drawn last, without colours', () => {
    const escape = String.fromCodePoint(0x1b);
    const { lines } = pickInstallOutput({
      tool: 'npm',
      output: `fetching 1/3\rfetching 3/3\n${escape}[31mnpm error code E404${escape}[39m`,
    });

    expect(lines).toEqual(['npm error code E404', 'fetching 3/3']);
  });

  it('Windows line endings keep every line', () => {
    const { lines } = pickInstallOutput({
      tool: 'npm',
      output: 'npm error code E404\r\nnpm error 404 Not Found\r\n',
    });

    expect(lines).toEqual(['npm error code E404', 'npm error 404 Not Found']);
  });
});
