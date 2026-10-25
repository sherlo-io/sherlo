/**
 * THE RECORD EVERY COMMAND KEEPS OF HOW IT ENDED, WHICH `sherlo feedback` ATTACHES.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installProjectFiles } from '../../seams/projectFiles';
import { BLANKED } from '../blankSecrets';
import { hideTokens, readLastCommand, recordLastCommand } from '../lastCommandRecord';

describe('the last command record', () => {
  let projectRoot: string;
  let putLiveFolderBack: () => void;
  let endProcess: (exitCode: number) => void;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'last-command-'));
    putLiveFolderBack = installProjectFiles({ root: () => projectRoot });
    // The record taps both streams; the spies keep the test output clean and are put back after.
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    vi.spyOn(process, 'once').mockImplementation(((_event: string, handler: typeof endProcess) => {
      endProcess = handler;
      return process;
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    putLiveFolderBack();
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('a CLI test leaves no last command record in the repository', () => {
    const repositoryRecord = path.join(process.cwd(), '.sherlo', 'last-command.json');

    // A posed run: the command starts in a temporary project, which is gone when the process ends.
    recordLastCommand('login', {});
    fs.rmSync(projectRoot, { recursive: true, force: true });
    putLiveFolderBack();
    endProcess(0);

    expect(fs.existsSync(repositoryRecord)).toBe(false);
    expect(fs.existsSync(projectRoot)).toBe(false);
  });

  it("Every Sherlo command records its name, its flags with tokens hidden, its exit code and its error lines in the project's .sherlo folder", () => {
    recordLastCommand('test', { platform: 'ios', projectToken: 'secret-token', token: undefined });
    process.stderr.write('\u001b[31mNo devices in the config\u001b[0m\nFix sherlo.config.json\n');
    endProcess(1);

    const recorded = JSON.parse(
      fs.readFileSync(path.join(projectRoot, '.sherlo', 'last-command.json'), 'utf8')
    );
    expect(recorded).toMatchObject({
      command: 'test',
      flags: { platform: 'ios', projectToken: '[hidden]' },
      exitCode: 1,
      errorLines: ['No devices in the config', 'Fix sherlo.config.json'],
    });
    expect(JSON.stringify(recorded)).not.toContain('secret-token');
    expect(fs.readFileSync(path.join(projectRoot, '.sherlo', '.gitignore'), 'utf8')).toBe('*\n');
    expect(readLastCommand()).toEqual({
      command: 'test',
      exitCode: 1,
      errorLines: ['No devices in the config', 'Fix sherlo.config.json'],
    });
  });

  it('A command that ends through process.exit with a refusal records the refusal it printed, with tokens blanked', () => {
    recordLastCommand('test', {});
    process.stdout.write('Building the app\n');
    process.stderr.write('Refused: the token sht_abcdefghijklmnopqrstuvwx was not accepted\n');
    endProcess(2);

    const recorded = JSON.parse(
      fs.readFileSync(path.join(projectRoot, '.sherlo', 'last-command.json'), 'utf8')
    );
    expect(recorded.exitCode).toBe(2);
    expect(recorded.errorLines).toEqual([
      'Building the app',
      `Refused: the token ${BLANKED} was not accepted`,
    ]);
    expect(JSON.stringify(recorded)).not.toContain('sht_abcdefghijklmnopqrstuvwx');
  });

  it('A command that ends well records no error lines', () => {
    recordLastCommand('view', {});
    process.stdout.write('Done\n');
    endProcess(0);

    expect(readLastCommand()).toEqual({ command: 'view', exitCode: 0, errorLines: [] });
  });

  it('An existing .sherlo/.gitignore is left alone', () => {
    fs.mkdirSync(path.join(projectRoot, '.sherlo'));
    fs.writeFileSync(path.join(projectRoot, '.sherlo', '.gitignore'), 'my-own-rule\n');
    recordLastCommand('login', {});
    endProcess(0);

    expect(fs.readFileSync(path.join(projectRoot, '.sherlo', '.gitignore'), 'utf8')).toBe(
      'my-own-rule\n'
    );
  });

  it('Every option whose name ends in token is hidden, whatever its case', () => {
    expect(hideTokens({ token: 'a', ProjectToken: 'b', verbose: true, emptyToken: '' })).toEqual({
      token: '[hidden]',
      ProjectToken: '[hidden]',
      verbose: true,
      emptyToken: '',
    });
  });

  it('A project folder that cannot be written leaves the command exiting as it would', () => {
    fs.writeFileSync(path.join(projectRoot, '.sherlo'), 'a file where the folder should be');
    recordLastCommand('login', {});

    expect(() => endProcess(0)).not.toThrow();
    expect(readLastCommand()).toBeUndefined();
  });
});
