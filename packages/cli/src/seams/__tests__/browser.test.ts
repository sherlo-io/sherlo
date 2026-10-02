/**
 * THE BROWSER SEAM'S LIVE HALF - what the opener's start and exit mean, and that it never holds the
 * login longer than its short grace.
 *
 * No real browser opens here: `BROWSER` names a small script that exits 0, exits 1, or keeps
 * running for a few seconds the way a real browser does - or a program that does not exist.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isWebLink, liveBrowser, openerCommand } from '../browser';

const LOGIN_LINK = 'https://app.sherlo.io/cli-login/lg7Qm2Xa';

let scratchFolder: string;

beforeEach(() => {
  scratchFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-browser-'));
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(scratchFolder, { recursive: true, force: true });
});

/** Point `BROWSER` at a shell script with this body. */
function browserThatRuns(scriptBody: string): void {
  const scriptPath = path.join(scratchFolder, 'browser.sh');
  fs.writeFileSync(scriptPath, `#!/bin/sh\n${scriptBody}\n`, { mode: 0o755 });
  vi.stubEnv('BROWSER', scriptPath);
}

describe.skipIf(process.platform === 'win32')('the live browser', () => {
  it('answers opened when the opener exits 0', async () => {
    browserThatRuns('exit 0');
    await expect(liveBrowser.open(LOGIN_LINK)).resolves.toBe(true);
  });

  it('answers not opened when the opener exits with an error', async () => {
    browserThatRuns('exit 3');
    await expect(liveBrowser.open(LOGIN_LINK)).resolves.toBe(false);
  });

  it('answers opened once the grace ends while the opener keeps running, and waits no longer', async () => {
    browserThatRuns('exec sleep 5');

    const startedAt = Date.now();
    await expect(liveBrowser.open(LOGIN_LINK)).resolves.toBe(true);

    // The grace, and not the browser's whole life: the wait line is never held behind it.
    expect(Date.now() - startedAt).toBeLessThan(3000);
  });

  it('answers not opened when the opener cannot start', async () => {
    vi.stubEnv('BROWSER', path.join(scratchFolder, 'no-such-browser'));
    await expect(liveBrowser.open(LOGIN_LINK)).resolves.toBe(false);
  });
});

describe('what the live browser is handed', () => {
  it('opens only an http or https link, and hands it to the opener as one argument', async () => {
    // An opener that would leave a mark if it were ever started.
    const markPath = path.join(scratchFolder, 'opener-started');
    browserThatRuns(`touch "${markPath}"`);

    for (const notAWebLink of [
      'file:///etc/passwd',
      'data:text/html,hello',
      'ftp://example.com/cli-login',
      'ms-settings:',
      '/cli-login/lg7Qm2Xa',
      '',
    ]) {
      await expect(liveBrowser.open(notAWebLink), notAWebLink).resolves.toBe(false);
    }
    expect(fs.existsSync(markPath), 'the opener was never started').toBe(false);

    expect(isWebLink(LOGIN_LINK)).toBe(true);
    expect(isWebLink('http://localhost:3000/cli-login/lg7Qm2Xa')).toBe(true);

    // Each platform's opener gets the link whole, as its last argument, with no shell between -
    // so `&`, `|` and `^` in it stay part of the link.
    vi.stubEnv('BROWSER', '');
    const linkWithSeparators = 'https://app.sherlo.io/cli-login/lg7Qm2Xa?a=1&b=2|x^y';

    expect(openerCommand(linkWithSeparators, 'win32')).toEqual([
      'rundll32',
      'url.dll,FileProtocolHandler',
      linkWithSeparators,
    ]);
    expect(openerCommand(linkWithSeparators, 'darwin')).toEqual(['open', linkWithSeparators]);
    expect(openerCommand(linkWithSeparators, 'linux')).toEqual(['xdg-open', linkWithSeparators]);

    vi.stubEnv('BROWSER', 'firefox');
    expect(openerCommand(linkWithSeparators, 'win32')).toEqual(['firefox', linkWithSeparators]);
  });
});
