/**
 * WHICH LINES OF A FAILED PACKAGE INSTALL THE SCREEN SHOWS: each manager's own error lines, read
 * from what that manager really printed, then a little context.
 *
 * installOutput.measured.json holds the real output of each manager, measured on Node 26.13.1 by
 * running its add command against a registry that refuses the connection, one that does not exist
 * (`registry.invalid`), and a range nothing was published for (`^99`). Only the home folder and the
 * project folder are renamed to the ones the pictures use.
 */
import { describe, expect, it } from 'vitest';
import type { Agent } from 'package-manager-detector';
import { pickInstallOutput, saysVersionNotPublished } from '../installOutput';
import measured from './installOutput.measured.json';

const SHERLO = '@sherlo/react-native-storybook';

const NOT_PUBLISHED: Array<[string, Agent, string]> = [
  ['npm 11.20.0', 'npm', measured.npmNotPublished],
  ['Yarn 1.22.22', 'yarn', measured.yarn1NotPublished],
  ['Yarn 4.18.1', 'yarn@berry', measured.yarn4NotPublished],
  ['pnpm 10.12.1', 'pnpm', measured.pnpm10NotPublished],
  ['pnpm 12.21.0', 'pnpm', measured.pnpm12NotPublished],
  ['Bun 1.4.5', 'bun', measured.bunNotPublished],
];

describe('the install says Sherlo is not published', () => {
  it.each(NOT_PUBLISHED)('%s: only when its error names Sherlo', (_, tool, output) => {
    expect(saysVersionNotPublished({ tool, output, packageName: SHERLO })).toBe(true);
    // Another dependency of the project with no matching version is an install that failed.
    const anotherPackage = output.replaceAll(SHERLO, 'react-native-reanimated');
    expect(saysVersionNotPublished({ tool, output: anotherPackage, packageName: SHERLO })).toBe(
      false
    );
  });

  it.each([
    ['npm 11.20.0', 'npm', measured.npmNotFound],
    ['pnpm 10.12.1', 'pnpm', measured.pnpm10NotFound],
    ['pnpm 12.21.0', 'pnpm', measured.pnpm12NotFound],
    ['Yarn 1.22.22', 'yarn', measured.yarn1NotFound],
    ['Yarn 4.18.1', 'yarn@berry', measured.yarn4Refused],
    ['Bun 1.4.5', 'bun', measured.bunNotFound],
  ] as Array<[string, Agent, string]>)(
    '%s: a registry it cannot reach is not',
    (_, tool, output) => {
      expect(saysVersionNotPublished({ tool, output, packageName: SHERLO })).toBe(false);
    }
  );
});

describe('npm 11.20.0', () => {
  it('a registry that does not exist: its error lines, its debug log named', () => {
    expect(pickInstallOutput({ tool: 'npm', output: measured.npmNotFound })).toEqual({
      lines: [
        'npm error code ENOTFOUND',
        'npm error syscall getaddrinfo',
        'npm error errno ENOTFOUND',
        'npm error network request to https://registry.invalid/@sherlo%2freact-native-storybook failed, reason: getaddrinfo ENOTFOUND registry.invalid',
        'npm error network This is a problem related to network connectivity.',
        'npm error network In most cases you are behind a proxy or have bad network settings.',
        'npm error network',
        "npm error network If you are behind a proxy, please make sure that the 'proxy' config is set properly.  See: 'npm help config'",
      ],
      toolLogFiles: ['/Users/anna/.npm/_logs/2026-11-27T17_14_55_680Z-debug-0.log'],
    });
  });

  it('a refused connection: the bare `npm error` line is one of its error lines', () => {
    const { lines } = pickInstallOutput({ tool: 'npm', output: measured.npmRefused });

    // 20 error lines, of which the first 15 show; none is read as context after them.
    expect(lines).toHaveLength(15);
    expect(lines.every((line) => line.startsWith('npm error'))).toBe(true);
    expect(lines[3]).toBe(
      'npm error FetchError: request to https://127.0.0.1:9/@sherlo%2freact-native-storybook failed, reason: connect ECONNREFUSED 127.0.0.1:9'
    );
  });
});

describe('pnpm 10.12.1', () => {
  it('a registry that does not exist: its error block, both retries as context', () => {
    expect(pickInstallOutput({ tool: 'pnpm', output: measured.pnpm10NotFound }).lines).toEqual([
      'ERR_PNPM_META_FETCH_FAIL  GET https://registry.invalid/@sherlo%2Freact-native-storybook: request to https://registry.invalid/@sherlo%2Freact-native-storybook failed, reason: getaddrinfo ENOTFOUND registry.invalid',
      'This error happened while installing a direct dependency of /Users/anna/acme-shop',
      'WARN  GET https://registry.invalid/@sherlo%2Freact-native-storybook error (ENOTFOUND). Will retry in 10 seconds. 2 retries left.',
      'WARN  GET https://registry.invalid/@sherlo%2Freact-native-storybook error (ENOTFOUND). Will retry in 1 minute. 1 retries left.',
    ]);
  });

  it('not published: its error block with the latest release', () => {
    expect(pickInstallOutput({ tool: 'pnpm', output: measured.pnpm10NotPublished }).lines).toEqual([
      'ERR_PNPM_NO_MATCHING_VERSION  No matching version found for @sherlo/react-native-storybook@^99 while fetching it from https://registry.npmjs.org/',
      'This error happened while installing a direct dependency of /Users/anna/acme-shop',
      'The latest release of @sherlo/react-native-storybook is "2.0.2".',
      'Other releases are:',
      '* alpha: 2.0.0-alpha.1',
      'If you need the full list of all 98 published versions run "$ pnpm view @sherlo/react-native-storybook versions".',
    ]);
  });
});

describe('pnpm 12.21.0', () => {
  it('a refused connection: the code, then each message of the box on one line', () => {
    expect(pickInstallOutput({ tool: 'pnpm', output: measured.pnpm12Refused }).lines).toEqual([
      'Error: ERR_PNPM_RESOLVING_NPM_RESOLVER_NETWORK_ERROR',
      'adding a new package',
      'Failed to fetch metadata from https://127.0.0.1:9/@sherlo%2Freact-native-storybook: error sending request: client error (Connect): tcp connect error: Connection refused (os error 61)',
      'error sending request',
      'client error (Connect)',
      'tcp connect error',
      'Connection refused (os error 61)',
    ]);
  });

  it('a registry that does not exist: the last message joined across its wrap', () => {
    expect(pickInstallOutput({ tool: 'pnpm', output: measured.pnpm12NotFound }).lines).toEqual([
      'Error: ERR_PNPM_RESOLVING_NPM_RESOLVER_NETWORK_ERROR',
      'adding a new package',
      'Failed to fetch metadata from https://registry.invalid/@sherlo%2Freact-native-storybook: error sending request: client error (Connect): dns error: error resolving DNS: failed to lookup address information: nodename nor servname provided, or not known',
      'error sending request',
      'client error (Connect)',
      'dns error',
      'error resolving DNS',
      'failed to lookup address information: nodename nor servname provided, or not known',
    ]);
  });

  it('not published: the box and its help, without the update banner', () => {
    expect(pickInstallOutput({ tool: 'pnpm', output: measured.pnpm12NotPublished }).lines).toEqual([
      'Error: ERR_PNPM_NO_MATCHING_VERSION',
      'adding a new package',
      'Failed to resolve dependency tree: No matching version found for @sherlo/react-native-storybook@^99 while fetching it from https://registry.npmjs.org/',
      'Failed to resolve @sherlo/react-native-storybook@^99',
      'No matching version found for @sherlo/react-native-storybook@^99 while fetching it from https://registry.npmjs.org/',
      'help: The latest release of @sherlo/react-native-storybook is "2.0.2".',
      'Other releases are:',
      '* alpha: 2.0.0-alpha.1',
      'If you need the full list of all 98 published versions run "pnpm view @sherlo/react-native-storybook versions".',
    ]);
  });
});

describe('Yarn 1.22.22', () => {
  it('a registry that does not exist: its error line, then its context once each', () => {
    expect(pickInstallOutput({ tool: 'yarn', output: measured.yarn1NotFound }).lines).toEqual([
      'error Error: getaddrinfo ENOTFOUND registry.invalid',
      'yarn add v1.22.22',
      'info No lockfile found.',
      '[1/4] Resolving packages...',
      'info There appears to be trouble with your network connection. Retrying...',
      'at GetAddrInfoReqWrap.onlookupall [as oncomplete] (node:dns:122:26)',
    ]);
  });

  it('not published: its error line, then its context without the documentation link', () => {
    expect(pickInstallOutput({ tool: 'yarn', output: measured.yarn1NotPublished }).lines).toEqual([
      'error Couldn\'t find any versions for "@sherlo/react-native-storybook" that matches "^99"',
      'yarn add v1.22.22',
      'info No lockfile found.',
      '[1/4] Resolving packages...',
    ]);
  });
});

describe('Yarn 4.18.1 --json', () => {
  it('a refused connection: the first line of its error record, no stack, no closing frame', () => {
    expect(pickInstallOutput({ tool: 'yarn@berry', output: measured.yarn4Refused }).lines).toEqual([
      'YN0001: Error [ERR_SOCKET_CLOSED_BEFORE_CONNECTION]: Socket closed before the connection was established',
    ]);
  });

  it('not published: its error record, no closing frame', () => {
    expect(
      pickInstallOutput({ tool: 'yarn@berry', output: measured.yarn4NotPublished }).lines
    ).toEqual(['YN0082: @sherlo/react-native-storybook@npm:^99: No candidates found']);
  });

  it('step frames in the data are left out too', () => {
    const record = (type: string, data: string) =>
      JSON.stringify({ type, name: 0, displayName: 'YN0000', indent: '', data });

    expect(
      pickInstallOutput({
        tool: 'yarn@berry',
        output: [record('info', '┌ Resolution step'), record('info', '└ Completed in 0s 245ms')]
          .concat(measured.yarn4NotPublished)
          .join('\n'),
      }).lines
    ).toEqual(['YN0082: @sherlo/react-native-storybook@npm:^99: No candidates found']);
  });
});

describe('Bun 1.4.5', () => {
  it.each([
    ['a refused connection', measured.bunRefused, 'ConnectionRefused'],
    ['a registry that does not exist', measured.bunNotFound, 'DNSResolveFailed'],
  ])('%s: its error line, then its progress lines', (_, output, cause) => {
    expect(pickInstallOutput({ tool: 'bun', output }).lines).toEqual([
      `error: ${cause} downloading package manifest @sherlo/react-native-storybook`,
      'bun add v1.4.5 (a7733435c)',
      'Resolving dependencies',
      'Resolved, downloaded and extracted [6]',
    ]);
  });

  it('not published: both its error lines', () => {
    expect(pickInstallOutput({ tool: 'bun', output: measured.bunNotPublished }).lines).toEqual([
      'error: No version matching "^99" found for specifier "@sherlo/react-native-storybook" (but package exists)',
      'error: @sherlo/react-native-storybook@^99 failed to resolve',
      'bun add v1.4.5 (a7733435c)',
      'Resolving dependencies',
      'Resolved, downloaded and extracted [2]',
    ]);
  });
});

describe('any manager', () => {
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
