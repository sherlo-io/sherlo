/**
 * The posed capture socket (captureSocket.ts): a posed scene run carries a discover capture's
 * unanswered requests through, whether the scene was reached or never was.
 */
import { describe, expect, it } from 'vitest';
import { posedCaptureSocket } from '../captureSocket';
import type { STABILIZATION_SETTINGS } from '../bundlerLine';

const settings = {} as typeof STABILIZATION_SETTINGS;
const target = { kind: 'no-target' } as never;
const unanswered = [{ method: 'GET', url: 'https://api.example.com/chats', contentType: 'json' }];

describe('a posed scene run with unanswered requests', () => {
  it('a reached scene carries them', async () => {
    const socket = posedCaptureSocket({
      scenes: ['chat'],
      route: ['Chat'],
      bootMs: 10,
      reachedMs: 20,
      play: [],
      settled: { ms: 5, frames: 3 },
      unanswered,
      tree: { primitive: 'View' },
    });

    const answer = await socket.captureScene({ sceneId: 'chat', port: 8081, settings, target });

    expect(answer).toMatchObject({ kind: 'scene', unanswered });
  });

  it('a scene never reached carries them', async () => {
    const socket = posedCaptureSocket({
      scenes: ['chat'],
      ready: 'inbox',
      stayedOn: ['Home'],
      unanswered,
    });

    const answer = await socket.captureScene({ sceneId: 'chat', port: 8081, settings, target });

    expect(answer).toMatchObject({ kind: 'never-reached', unanswered });
  });

  it('a reached scene with none states none', async () => {
    const socket = posedCaptureSocket({
      scenes: ['chat'],
      route: ['Chat'],
      bootMs: 10,
      reachedMs: 20,
      play: [],
      settled: { ms: 5, frames: 3 },
      tree: { primitive: 'View' },
    });

    const answer = await socket.captureScene({ sceneId: 'chat', port: 8081, settings, target });

    expect(answer).not.toHaveProperty('unanswered');
  });
});
