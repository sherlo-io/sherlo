/**
 * Tests for the sim world file reader/validator (./simWorld).
 *
 * A world file is a hand-written fixture, so the contract under test is the
 * OPPOSITE of the module-manifest reader's bail-open: strict, and READABLE -
 * every problem reported at once, each naming the offending story/path/field,
 * so the author fixes the whole file in one pass.
 */
import chalk from 'chalk';
chalk.level = 0;

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readSimWorld,
  resolveSimWorldPath,
  SIM_WORLD_FILENAME,
  validateSimWorld,
} from '../simWorld';

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-sim-world-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function validWorldJson() {
  return {
    simVersion: 1,
    modules: {
      'src/components/SharedButton.tsx': 'SharedButton v1',
      'src/stories/SharedButton.stories.tsx': 'story shell',
    },
    stories: [
      {
        id: 'sharedbutton--primary',
        file: 'src/stories/SharedButton.stories.tsx',
        imports: ['src/components/SharedButton.tsx'],
        render: { text: 'Primary Button', bg: '#ffffff' },
      },
    ],
    run: { outcome: 'ok' },
  };
}

/** Validate and return the problem list (empty for a valid world). */
function problemsOf(json: unknown): string[] {
  return validateSimWorld(json).problems;
}

describe('validateSimWorld', () => {
  it('accepts the design-section-1 example world', () => {
    const result = validateSimWorld(validWorldJson());

    expect(result.problems).toEqual([]);
    expect(result.world).not.toBeNull();
  });

  it('names a wrong simVersion with the value it saw', () => {
    const problems = problemsOf({ ...validWorldJson(), simVersion: 2 });

    expect(problems.join('\n')).toContain('`simVersion` must be the number 1 (got 2)');
  });

  it('reports EVERY problem at once, not just the first', () => {
    const problems = problemsOf({
      simVersion: 'nope',
      modules: { 'src/a.tsx': 42 },
      stories: [{ id: '', file: 'src/missing.tsx', imports: 'not-an-array', render: {} }],
      run: { outcome: 'explode' },
    });

    const joined = problems.join('\n');
    expect(problems.length).toBeGreaterThanOrEqual(5);
    expect(joined).toContain('`simVersion`');
    expect(joined).toContain('module "src/a.tsx" must have string content');
    expect(joined).toContain('`id`');
    expect(joined).toContain('`imports` array');
    expect(joined).toContain('`render` object');
    expect(joined).toContain('`run.outcome` "explode" is not recognized');
  });

  it('refuses a story whose file is not a declared module, naming both', () => {
    const json = validWorldJson();
    json.stories[0].file = 'src/stories/Ghost.stories.tsx';

    const problems = problemsOf(json);

    expect(problems).toEqual([
      'story "sharedbutton--primary" `file` "src/stories/Ghost.stories.tsx" does not name a declared module',
    ]);
  });

  it('refuses an import that is not a declared module, naming the story and the path', () => {
    const json = validWorldJson();
    json.stories[0].imports = ['src/components/Ghost.tsx'];

    const problems = problemsOf(json);

    expect(problems).toEqual([
      'story "sharedbutton--primary" import "src/components/Ghost.tsx" does not name a declared module',
    ]);
  });

  it('refuses duplicate story ids', () => {
    const json = validWorldJson();
    json.stories.push({ ...json.stories[0] });

    const problems = problemsOf(json);

    expect(problems.join('\n')).toContain(
      'story "sharedbutton--primary" declares a duplicate id - story ids must be unique'
    );
  });

  it('refuses non-portable module paths with the reason', () => {
    const problems = problemsOf({
      ...validWorldJson(),
      modules: {
        '/abs/path.tsx': 'x',
        'src\\windows.tsx': 'x',
        'src/../escape.tsx': 'x',
        'src/components/SharedButton.tsx': 'SharedButton v1',
        'src/stories/SharedButton.stories.tsx': 'story shell',
      },
    });

    const joined = problems.join('\n');
    expect(joined).toContain('module path "/abs/path.tsx" is absolute');
    expect(joined).toContain('module path "src\\windows.tsx" contains a backslash');
    expect(joined).toContain('module path "src/../escape.tsx" contains a `.` or `..` segment');
  });

  it('refuses two module paths that collide after `./` normalization', () => {
    const problems = problemsOf({
      ...validWorldJson(),
      modules: {
        'src/components/SharedButton.tsx': 'SharedButton v1',
        './src/components/SharedButton.tsx': 'SharedButton v1 again',
        'src/stories/SharedButton.stories.tsx': 'story shell',
      },
    });

    expect(problems.join('\n')).toContain('collides with another declared module');
  });

  it('accepts every declared run outcome shape', () => {
    for (const outcome of ['ok', 'crash-on-launch', 'system-error'] as const) {
      expect(problemsOf({ ...validWorldJson(), run: { outcome } })).toEqual([]);
    }

    expect(
      problemsOf({
        ...validWorldJson(),
        run: { outcome: { storyErrors: ['sharedbutton--primary'] } },
      })
    ).toEqual([]);
  });

  it('refuses storyErrors naming an undeclared story id', () => {
    const problems = problemsOf({
      ...validWorldJson(),
      run: { outcome: { storyErrors: ['ghost--story'] } },
    });

    expect(problems).toEqual([
      '`run.outcome.storyErrors` names "ghost--story", which is not a declared story id',
    ]);
  });
});

describe('readSimWorld', () => {
  it('returns the exact committed bytes plus the normalized parse', () => {
    const filePath = path.join(tempDir, SIM_WORLD_FILENAME);
    const bytes = JSON.stringify(validWorldJson(), null, 2);
    fs.writeFileSync(filePath, bytes, 'utf8');

    const world = readSimWorld(filePath);

    expect(world.raw.toString('utf8')).toBe(bytes);
    expect(world.filePath).toBe(filePath);
    expect(world.parsed.stories[0].id).toBe('sharedbutton--primary');
  });

  it('names the path when the file cannot be read', () => {
    const missing = path.join(tempDir, 'nowhere.json');

    expect(() => readSimWorld(missing)).toThrow(missing);
  });

  it('says invalid JSON is invalid JSON, naming the path', () => {
    const filePath = path.join(tempDir, SIM_WORLD_FILENAME);
    fs.writeFileSync(filePath, '{ not json', 'utf8');

    expect(() => readSimWorld(filePath)).toThrow(/is not valid JSON/);
  });

  it('lists every shape problem in the thrown message', () => {
    const filePath = path.join(tempDir, SIM_WORLD_FILENAME);
    const json = validWorldJson();
    json.stories[0].imports = ['src/components/Ghost.tsx'];
    (json as Record<string, unknown>).simVersion = 9;
    fs.writeFileSync(filePath, JSON.stringify(json), 'utf8');

    expect(() => readSimWorld(filePath)).toThrow(
      /simVersion[\s\S]*Ghost\.tsx[\s\S]*does not name a declared module/
    );
  });
});

describe('resolveSimWorldPath', () => {
  it('prefers the explicit --sim path and marks it explicit', () => {
    expect(resolveSimWorldPath({ sim: '/worlds/w.json', projectRoot: tempDir })).toEqual({
      filePath: '/worlds/w.json',
      explicit: true,
    });
  });

  it('detects sim-world.json in the project root', () => {
    fs.writeFileSync(path.join(tempDir, SIM_WORLD_FILENAME), '{}', 'utf8');

    expect(resolveSimWorldPath({ projectRoot: tempDir })).toEqual({
      filePath: path.join(tempDir, SIM_WORLD_FILENAME),
      explicit: false,
    });
  });

  it('returns undefined when neither the flag nor the file is present', () => {
    expect(resolveSimWorldPath({ projectRoot: tempDir })).toBeUndefined();
  });
});
