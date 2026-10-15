/**
 * THE LIVE SERVER CALLS that go through the sdk client - the request is handed to the client whole,
 * and the client's answer is handed back whole.
 */
import { describe, expect, it, vi } from 'vitest';

const startedRun = {
  devices: [
    { id: 'pixel7', osVersion: '14', theme: 'light', locale: 'en_US', fontScale: 'default' },
  ],
  capture: [{ platform: 'android', full: true, capturedStories: 24, storiesInBundle: 24 }],
};

const sdkClientMock = vi.hoisted(() => ({
  joinBuild: vi.fn(),
  factory: vi.fn(),
}));

vi.mock('@sherlo/sdk-client', () => ({
  default: sdkClientMock.factory.mockImplementation(() => ({ joinBuild: sdkClientMock.joinBuild })),
}));

import { liveServerCalls } from '../serverCalls';

describe('liveServerCalls', () => {
  it('joinBuild sends the request through the sdk client and answers the run, the platforms it waits for and the started run', async () => {
    const answer = { build: { index: 7 }, waitingFor: [], startedRun };
    sdkClientMock.joinBuild.mockResolvedValue(answer);
    const request = { joinKey: 'github-123', platform: 'ios', projectIndex: 1, teamId: 'team' };

    const joined = await liveServerCalls.joinBuild({
      token: 'sht_personal',
      ...request,
    } as unknown as Parameters<typeof liveServerCalls.joinBuild>[0]);

    expect(sdkClientMock.joinBuild).toHaveBeenCalledWith(request);
    expect(joined).toBe(answer);
  });
});
