/**
 * SITE TWO, proven past the seam that hid it (architect review, sherlo#293).
 *
 * Every other dry-run test mocks `requestDryRunDecision` (or answers it through a posed
 * `serverCalls()`), so none of them can tell whether the SDK client `sherlo test` builds
 * actually reaches the address a `SHERLO_API_URL` override names - they never let the
 * command build a real client and dial out. That gap is exactly how the endpoint-override
 * bug hid: a real dry run pointed at an address nothing listens on still asked the REAL
 * default server (SHERLO_API_URL was never read on the test path), got a confident answer,
 * and printed "first build" instead of bailing open.
 *
 * This file mocks NOTHING. It builds the real `@sherlo/sdk-client` the way `stagedRun.ts` /
 * `simRun.ts` / `uploadOrReuseBuildsAndRunTests.ts` now do - `sdkClient(tokens,
 * getEndpointUrl())` - points it at a loopback port nothing listens on, and drives the real
 * `runDryRunPreview` end to end. If the endpoint override were ever dropped again, the
 * request would reach the real backend instead of failing fast, and this test would hang or
 * print a confident decision instead of "could not tell".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sdkClient from '@sherlo/sdk-client';
import { runDryRunPreview } from '../dryRun';
import { getEndpointUrl } from '../../../helpers/buildStatusRequest';

// A loopback port nothing listens on: the connection is refused immediately (no timeout to
// wait out), which is what makes this test fast AND deterministic in any sandbox - no real
// network egress, just a local TCP RST.
const NOTHING_LISTENS_HERE = 'http://127.0.0.1:1/graphql';

const originalApiUrl = process.env.SHERLO_API_URL;

beforeEach(() => {
  // The exact override the real e2e beat sets (sherlo-tester's `apiUnreachable`,
  // UNROUTABLE_API_URL) - reading it through `getEndpointUrl()` is what proves the CLI's OWN
  // resolution is what's under test, not just the SDK client's second argument.
  process.env.SHERLO_API_URL = NOTHING_LISTENS_HERE;
});

afterEach(() => {
  if (originalApiUrl === undefined) delete process.env.SHERLO_API_URL;
  else process.env.SHERLO_API_URL = originalApiUrl;
});

describe('the dry-run decision honours an endpoint override end to end', () => {
  it('a real client pointed at an address nothing listens on says it could not tell, never a first build', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // The exact construction the three `sherlo test` roads use: the endpoint travels with the
    // client, not through the SDK's own (unreliable, on the published package) env fallback.
    const client = sdkClient({ authToken: 'pose-token' }, getEndpointUrl());

    await runDryRunPreview({
      client,
      bundles: {
        ios: {
          moduleManifest: {
            raw: Buffer.from('{}'),
            parsed: { version: 1, header: {}, moduleHashes: {}, storyClosures: {} },
          },
        },
      } as any,
      platformsToTest: ['ios'],
      projectIndex: 1,
      teamId: 'team-42',
      gitInfo: { branchName: 'feature', commitHash: 'abc', commitName: 'msg' } as any,
      baseReference: 'fp-123',
    });

    const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).toContain('🍎 iOS - would capture all stories');
    expect(printed).toContain("! couldn't compute what changed - capturing everything to be safe");
    expect(printed).not.toContain('first build');
    expect(printed).not.toContain('in this bundle');

    logSpy.mockRestore();
  }, 15_000);
});
