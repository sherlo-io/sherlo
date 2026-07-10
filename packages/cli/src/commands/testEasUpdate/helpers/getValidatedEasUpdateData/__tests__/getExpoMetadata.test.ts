/**
 * Unit tests for getExpoMetadata.
 *
 * getExpoMetadata shells out to `npx --yes expo config --json`, JSON-parses the
 * stdout, and returns `{ slug, baseUpdateUrl }`. We stub `runShellCommand` (the
 * only I/O boundary) and feed it fixture strings representative of real
 * `expo config --json` output across Expo SDK 50/51/52, plus the failure modes.
 *
 * Failure-mode tests assert the USER-FACING error message produced by
 * throwError - never a raw JSON.parse stack leaking through.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runShellCommand: vi.fn(),
}));

// Replace only runShellCommand in the helpers barrel; keep the real throwError
// and getErrorWithCustomMessage so we assert the genuine user-facing messages.
vi.mock('../../../../../helpers', async (importActual) => {
  const actual = await importActual<typeof import('../../../../../helpers')>();
  return { ...actual, runShellCommand: mocks.runShellCommand };
});

import getExpoMetadata from '../getExpoMetadata';

afterEach(() => {
  vi.clearAllMocks();
});

const COMMAND_PARAMS = { projectRoot: '/tmp/project' } as any;

// ---------------------------------------------------------------------------
// Representative `expo config --json` fixtures per SDK version
// ---------------------------------------------------------------------------

const SDK_50_CONFIG = JSON.stringify({
  name: 'MyApp',
  slug: 'my-app-sdk50',
  version: '1.0.0',
  sdkVersion: '50.0.0',
  platforms: ['ios', 'android'],
  runtimeVersion: { policy: 'sdkVersion' },
  updates: { url: 'https://u.expo.dev/00000000-0000-0000-0000-000000000050' },
});

const SDK_51_CONFIG = JSON.stringify({
  name: 'MyApp',
  slug: 'my-app-sdk51',
  version: '1.0.0',
  sdkVersion: '51.0.0',
  platforms: ['ios', 'android'],
  runtimeVersion: '1.0.0',
  updates: { url: 'https://u.expo.dev/11111111-1111-1111-1111-000000000051' },
});

const SDK_52_CONFIG = JSON.stringify({
  name: 'MyApp',
  slug: 'my-app-sdk52',
  version: '1.0.0',
  sdkVersion: '52.0.0',
  platforms: ['ios', 'android'],
  runtimeVersion: { policy: 'fingerprint' },
  updates: {
    url: 'https://u.expo.dev/22222222-2222-2222-2222-000000000052',
    fallbackToCacheTimeout: 0,
  },
  extra: { eas: { projectId: '22222222-2222-2222-2222-000000000052' } },
});

// ---------------------------------------------------------------------------
// Happy path - table driven across SDK shapes
// ---------------------------------------------------------------------------

describe('getExpoMetadata - happy path', () => {
  const cases: Array<{
    name: string;
    output: string;
    expected: { slug: string; baseUpdateUrl: string };
  }> = [
    {
      name: 'Expo SDK 50 config',
      output: SDK_50_CONFIG,
      expected: {
        slug: 'my-app-sdk50',
        baseUpdateUrl: 'https://u.expo.dev/00000000-0000-0000-0000-000000000050',
      },
    },
    {
      name: 'Expo SDK 51 config',
      output: SDK_51_CONFIG,
      expected: {
        slug: 'my-app-sdk51',
        baseUpdateUrl: 'https://u.expo.dev/11111111-1111-1111-1111-000000000051',
      },
    },
    {
      name: 'Expo SDK 52 config',
      output: SDK_52_CONFIG,
      expected: {
        slug: 'my-app-sdk52',
        baseUpdateUrl: 'https://u.expo.dev/22222222-2222-2222-2222-000000000052',
      },
    },
  ];

  for (const { name, output, expected } of cases) {
    it(`returns { slug, baseUpdateUrl } for ${name}`, async () => {
      mocks.runShellCommand.mockResolvedValue(output);

      await expect(getExpoMetadata(COMMAND_PARAMS)).resolves.toEqual(expected);
    });
  }

  it('runs `npx --yes expo config --json` in the command projectRoot', async () => {
    mocks.runShellCommand.mockResolvedValue(SDK_51_CONFIG);

    await getExpoMetadata(COMMAND_PARAMS);

    expect(mocks.runShellCommand).toHaveBeenCalledWith({
      command: 'npx --yes expo config --json',
      projectRoot: '/tmp/project',
    });
  });
});

// ---------------------------------------------------------------------------
// Failure modes - assert the user-facing message, not a raw throw
// ---------------------------------------------------------------------------

describe('getExpoMetadata - failure modes', () => {
  it('surfaces an UNEXPECTED ERROR when the shell command exits non-zero', async () => {
    const shellError: Error & { stderr?: string } = new Error(
      'Command failed: npx --yes expo config --json'
    );
    shellError.stderr = 'expo: command not found';
    mocks.runShellCommand.mockRejectedValue(shellError);

    await expect(getExpoMetadata(COMMAND_PARAMS)).rejects.toThrow('UNEXPECTED ERROR');
    await expect(getExpoMetadata(COMMAND_PARAMS)).rejects.toThrow(
      'Command failed: npx --yes expo config --json'
    );
  });

  it('reports a clear "Invalid ... output" message for non-JSON stdout (no parse leak)', async () => {
    mocks.runShellCommand.mockResolvedValue('this is not json at all');

    // The primary message is our own wrapper, not a raw "Unexpected token" throw.
    await expect(getExpoMetadata(COMMAND_PARAMS)).rejects.toThrow(
      'Invalid `npx --yes expo config --json` output'
    );
  });

  it('reports a clear message when stdout is empty', async () => {
    mocks.runShellCommand.mockResolvedValue('');

    await expect(getExpoMetadata(COMMAND_PARAMS)).rejects.toThrow(
      'Invalid `npx --yes expo config --json` output'
    );
  });

  it('reports "`slug` property is missing" when slug is absent', async () => {
    mocks.runShellCommand.mockResolvedValue(
      JSON.stringify({ updates: { url: 'https://u.expo.dev/abc' } })
    );

    await expect(getExpoMetadata(COMMAND_PARAMS)).rejects.toThrow('`slug` property is missing');
  });

  it('reports "`updates.url` property is missing" when updates.url is absent', async () => {
    mocks.runShellCommand.mockResolvedValue(JSON.stringify({ slug: 'my-app' }));

    await expect(getExpoMetadata(COMMAND_PARAMS)).rejects.toThrow(
      '`updates.url` property is missing'
    );
  });

  it('reports "`updates.url` property is missing" when updates exists but url does not', async () => {
    mocks.runShellCommand.mockResolvedValue(
      JSON.stringify({ slug: 'my-app', updates: { fallbackToCacheTimeout: 0 } })
    );

    await expect(getExpoMetadata(COMMAND_PARAMS)).rejects.toThrow(
      '`updates.url` property is missing'
    );
  });
});
