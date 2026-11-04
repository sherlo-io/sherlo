/**
 * `sherlo capture-report` - the review page over the kept captures, or the same facts once with
 * `--json`. The server and the browser are posed; the kept captures are real files in a folder.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSON_OPTION } from '../../../constants';
import { installBrowser } from '../../../seams/browser';
import { installLocalServer } from '../../../seams/localServer';
import type { LocalServer, Site } from '../../../seams/localServer';
import { installProjectFiles } from '../../../seams/projectFiles';
import captureReport from '../captureReport';

const CAPTURE_FOLDER = '2026-11-01T09-30-00.000Z_chat--conversation';

let project: string;
let printed: string;
let undo: Array<() => void>;

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-capture-report-'));
  const folder = path.join(project, '.sherlo', 'captures', CAPTURE_FOLDER);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'screen.png'), 'picture');
  fs.writeFileSync(
    path.join(folder, 'record.json'),
    JSON.stringify({
      kind: 'scene',
      bootMs: 1,
      reached: { route: ['Chat'], ms: 2 },
      play: [],
      settled: { ms: 3, frames: 4 },
      tree: { size: { width: 360, height: 800 } },
    })
  );

  printed = '';
  vi.spyOn(process.stdout, 'write').mockImplementation(((text: string) => {
    printed += text;
    return true;
  }) as never);
  undo = [installProjectFiles({ root: () => project })];
});

afterEach(() => {
  for (const restore of undo) restore();
  vi.restoreAllMocks();
  fs.rmSync(project, { recursive: true, force: true });
});

/** A server that never listens: it keeps the site it was handed and is stopped at once. */
function serverWithPage(pageFolder: string | undefined): LocalServer & { sites: Site[] } {
  const sites: Site[] = [];
  return {
    sites,
    pageFolder: () => pageFolder,
    serve: async (site) => {
      sites.push(site);
      return { address: 'http://127.0.0.1:4321', stopped: Promise.resolve(), stop: () => {} };
    },
  };
}

describe('sherlo capture-report', () => {
  it('--json prints the report once, with the pictures as absolute paths, and serves nothing', async () => {
    const server = serverWithPage('/page');
    undo.push(installLocalServer(server));

    await captureReport({ [JSON_OPTION]: true });

    const report = JSON.parse(printed);
    expect(report.summary).toMatchObject({ capturedCount: 1, isLive: false });
    expect(report.captures[0].picture).toBe(
      path.join(project, '.sherlo', 'captures', CAPTURE_FOLDER, 'screen.png')
    );
    expect(server.sites).toEqual([]);
  });

  it('serves the page over the captures folder, prints the address and opens the browser', async () => {
    const server = serverWithPage('/page');
    const opened: string[] = [];
    undo.push(
      installLocalServer(server),
      installBrowser({
        open: async (url) => {
          opened.push(url);
          return true;
        },
      })
    );

    await captureReport({});

    expect(opened).toEqual(['http://127.0.0.1:4321']);
    expect(printed).toContain('http://127.0.0.1:4321');
    expect(printed).toContain('1 captured, 0 not captured, 0 changed');
    expect(server.sites[0].pageFolder).toBe('/page');
    expect(server.sites[0].capturesFolder).toBe(path.join(project, '.sherlo', 'captures'));
    const live = server.sites[0].report() as {
      summary: { isLive: boolean };
      captures: { picture: string }[];
    };
    expect(live.summary.isLive).toBe(true);
    expect(live.captures[0].picture).toBe(`data/pictures/${CAPTURE_FOLDER}.png`);
  });

  it('says so when the browser did not come up, with the address still on the screen', async () => {
    undo.push(
      installLocalServer(serverWithPage('/page')),
      installBrowser({ open: async () => false })
    );

    await captureReport({});

    expect(printed).toContain('http://127.0.0.1:4321');
    expect(printed).toContain('The browser did not open');
  });

  it('refuses, naming --json, when this install has no review page', async () => {
    undo.push(installLocalServer(serverWithPage(undefined)));
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(captureReport({})).rejects.toThrow(/--json/);
    expect(printed).toBe('');
  });
});
