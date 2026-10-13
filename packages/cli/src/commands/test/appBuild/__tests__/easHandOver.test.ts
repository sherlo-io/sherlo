/**
 * Will EAS upload the hand-over file? (sherlo / Cloud builds on EAS, "What does `sherlo test` do in
 * EAS mode?") - each case lays a project folder out on disk and asks the refusal, the way EAS packs
 * it: `cli.requireCommit` uploads only committed files, an `.easignore` at the root is read alone, and
 * without one every `.gitignore` applies.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { refuseWhenEasLeavesTheHandOverOut } from '../easHandOver';

let projectRoot: string;

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-eas-hand-over-'));
  fs.mkdirSync(path.join(projectRoot, '.git'));
});

afterEach(() => {
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

function write(relativePath: string, content: string) {
  const full = path.join(projectRoot, relativePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

describe('EAS mode refuses before a run opens when EAS would leave the hand-over file out of its upload', () => {
  it('refuses when .gitignore leaves .sherlo/ out and no .easignore keeps it, naming the line and the fix', () => {
    write('.gitignore', 'node_modules/\n.sherlo/\n');

    expect(() => refuseWhenEasLeavesTheHandOverOut(projectRoot)).toThrow(
      /\.gitignore ignores it with the line "\.sherlo\/"[\s\S]*copy \.gitignore to \.easignore/
    );
  });

  it('with an .easignore, reads it alone and lets the hand-over file through when it does not list .sherlo/', () => {
    write('.gitignore', '.sherlo/\n');
    write('.easignore', 'node_modules/\n');

    expect(() => refuseWhenEasLeavesTheHandOverOut(projectRoot)).not.toThrow();
  });

  it('refuses when .easignore leaves .sherlo/ out, naming the line to remove', () => {
    write('.easignore', '/.sherlo\n');

    expect(() => refuseWhenEasLeavesTheHandOverOut(projectRoot)).toThrow(
      /\.easignore leaves it out with the line "\/\.sherlo"/
    );
  });

  it('reads a .gitignore in a folder above the project, as EAS does from the repository root', () => {
    const appRoot = path.join(projectRoot, 'apps', 'mobile');
    fs.mkdirSync(appRoot, { recursive: true });
    write('.gitignore', '**/.sherlo/*\n');

    expect(() => refuseWhenEasLeavesTheHandOverOut(appRoot)).toThrow(
      /the line "\*\*\/\.sherlo\/\*"/
    );
  });

  it('lets a later ! line bring the hand-over file back', () => {
    write('.gitignore', '*.json\n!.sherlo/data.json\n');

    expect(() => refuseWhenEasLeavesTheHandOverOut(projectRoot)).not.toThrow();
  });

  it('refuses when eas.json sets cli.requireCommit, since the hand-over file is never committed', () => {
    write('eas.json', JSON.stringify({ cli: { requireCommit: true } }));

    expect(() => refuseWhenEasLeavesTheHandOverOut(projectRoot)).toThrow(/"requireCommit": true/);
  });
});
