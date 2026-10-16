/**
 * `sherlo pose <pose.json...> --screens-to <dir>` draws many poses in one process, and each file
 * it writes holds what `sherlo pose <file>` would have printed as a process of its own: the
 * committed screen beside each catalogue pose, and a refused document's own refusal.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { poseMany } from '../poseMany';
import { POSES_ROOT } from '../catalogue';

const POSES = ['logout/ended', 'logout/not-logged-in', 'test/refusal-token-malformed'];

let screensTo: string;
let notAPose: string;
let devtools: string | undefined;

beforeAll(() => {
  devtools = process.env.SHERLO_DEVTOOLS;
  process.env.SHERLO_DEVTOOLS = '1';
  screensTo = fs.mkdtempSync(path.join(os.tmpdir(), 'pose-many-'));
  notAPose = path.join(screensTo, 'not-a-pose.json');
  fs.writeFileSync(notAPose, '{"argv": 42}\n');
});

afterAll(() => {
  if (devtools === undefined) delete process.env.SHERLO_DEVTOOLS;
  else process.env.SHERLO_DEVTOOLS = devtools;
  fs.rmSync(screensTo, { recursive: true, force: true });
});

const screenOf = (fileName: string) =>
  JSON.parse(fs.readFileSync(path.join(screensTo, 'out', fileName), 'utf8')) as {
    stdout: string;
    stderr: string;
    exitCode: number;
  };

describe('sherlo pose --screens-to', () => {
  it("writes each pose's own screen and exit code, refusals included", async () => {
    const posePaths = POSES.map((name) => path.join(POSES_ROOT, `${name}.pose.json`));

    await poseMany([...posePaths, notAPose], {
      screensTo: path.join(screensTo, 'out'),
      terminal: true,
    });

    for (const name of POSES) {
      const { stdout, exitCode } = screenOf(`${path.basename(name)}.pose.json`);
      const committed = fs.readFileSync(path.join(POSES_ROOT, `${name}.txt`), 'utf8');
      expect(`${stdout}\n[exit ${exitCode}]\n`).toBe(committed);
    }

    const refused = screenOf('not-a-pose.json');
    expect(refused.stderr).toContain('This is not a CommandPose');
    expect(refused.exitCode).toBe(1);
  });

  it('refuses two poses that share a file name before drawing either', async () => {
    const one = path.join(POSES_ROOT, 'logout', 'ended.pose.json');

    await expect(
      poseMany([one, one], { screensTo: path.join(screensTo, 'twice'), terminal: true })
    ).rejects.toThrow('Two poses share the file name ended.pose.json');
    expect(fs.existsSync(path.join(screensTo, 'twice'))).toBe(false);
  });
});
