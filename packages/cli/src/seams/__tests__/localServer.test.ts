/**
 * THE LOCAL SERVER SEAM - the live half serves the page, the report and the pictures on this
 * computer's own address and nothing outside those folders; the posed half answers from the pose.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { liveLocalServer, posedLocalServer } from '../localServer';
import type { RunningServer, Site } from '../localServer';

let folder: string;
let running: RunningServer | undefined;

beforeEach(() => {
  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-local-server-'));
  fs.mkdirSync(path.join(folder, 'page'));
  fs.writeFileSync(path.join(folder, 'page', 'index.html'), '<h1>review</h1>');
  fs.writeFileSync(path.join(folder, 'secret.txt'), 'outside');
  fs.mkdirSync(path.join(folder, 'captures', 'one'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'captures', 'one', 'screen.png'), 'png-bytes');
  fs.writeFileSync(path.join(folder, 'captures', 'one', 'ended-on.png'), 'ended-bytes');
});

afterEach(async () => {
  running?.stop();
  await running?.stopped;
  running = undefined;
  fs.rmSync(folder, { recursive: true, force: true });
});

const site = (): Site => ({
  pageFolder: path.join(folder, 'page'),
  capturesFolder: path.join(folder, 'captures'),
  report: () => ({ captures: [] }),
});

/** Whether `promise` has settled by the time the event loop turns once. */
function hasSettled(promise: Promise<void>): Promise<boolean> {
  return Promise.race([
    promise.then(() => true),
    new Promise<boolean>((answer) => setImmediate(() => answer(false))),
  ]);
}

async function get(route: string): Promise<{ status: number; body: string }> {
  running = await liveLocalServer.serve(site());
  const response = await fetch(`${running.address}${route}`);
  return { status: response.status, body: await response.text() };
}

describe('the local server', () => {
  it('serves the page, the report and a kept picture', async () => {
    expect(await get('/')).toEqual({ status: 200, body: '<h1>review</h1>' });
    const base = running!.address;
    expect(await (await fetch(`${base}/data/report.json`)).json()).toEqual({ captures: [] });
    expect(await (await fetch(`${base}/data/pictures/one.png`)).text()).toBe('png-bytes');
  });

  it('serves the frame a stopped scene ended on beside its picture', async () => {
    await get('/');
    const base = running!.address;
    expect(await (await fetch(`${base}/data/pictures/one.ended.png`)).text()).toBe('ended-bytes');
  });

  it('answers 404 for a path that leaves the page folder or is not there', async () => {
    expect((await get('/%2e%2e/secret.txt')).status).toBe(404);
    const base = running!.address;
    expect((await fetch(`${base}/data/pictures/..%2f..%2fsecret.png`)).status).toBe(404);
    expect((await fetch(`${base}/missing.js`)).status).toBe(404);
  });

  it('keeps answering after a report that could not be built', async () => {
    let attempts = 0;
    running = await liveLocalServer.serve({
      ...site(),
      report: () => {
        attempts += 1;
        if (attempts === 1) throw new Error('half-written');
        return { captures: [] };
      },
    });

    expect((await fetch(`${running.address}/data/report.json`)).status).toBe(503);
    expect((await fetch(`${running.address}/data/report.json`)).status).toBe(200);
  });

  it('listens on this computer only, and `stopped` settles when it is stopped', async () => {
    running = await liveLocalServer.serve(site());
    expect(running.address).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    running.stop();
    await expect(running.stopped).resolves.toBeUndefined();
  });

  it('`opened` settles when the page reads its report a second time, and not after the first', async () => {
    running = await liveLocalServer.serve(site());

    await fetch(`${running.address}/data/report.json`);
    await fetch(`${running.address}/data/pictures/one.png`);
    expect(await hasSettled(running.opened)).toBe(false);

    await fetch(`${running.address}/data/report.json`);
    expect(await hasSettled(running.opened)).toBe(true);
  });

  it('`opened` settles after a minute when no page ever reads the report', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      running = await liveLocalServer.serve(site());
      vi.advanceTimersByTime(59_999);
      expect(await hasSettled(running.opened)).toBe(false);

      vi.advanceTimersByTime(1);
      expect(await hasSettled(running.opened)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('has no page folder in a run from source, where nothing was built', () => {
    expect(liveLocalServer.pageFolder()).toBeUndefined();
  });

  it('a posed server answers on the pose port and refuses a pose that states none', async () => {
    const posed = posedLocalServer({ port: 4321 });
    expect((await posed.serve(site())).address).toBe('http://127.0.0.1:4321');
    expect(posed.refusals()).toEqual([]);
    expect(posed.watched()).toBe(true);
    expect(posedLocalServer({ port: 4321, watched: false }).watched()).toBe(false);

    const unposed = posedLocalServer(undefined);
    await unposed.serve(site());
    expect(unposed.refusals()).toHaveLength(1);
  });
});
