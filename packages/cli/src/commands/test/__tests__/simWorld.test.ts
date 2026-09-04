/**
 * Tests for the sim world tree reader/validator (./simWorld).
 *
 * A world is a hand-written fixture, so the contract under test is the OPPOSITE
 * of the module-manifest reader's bail-open: strict, and READABLE - every
 * problem reported at once, each naming the offending file/story/field, so the
 * author fixes the whole world in one pass.
 *
 * The canonical-bytes half is tested here rather than left to a convention,
 * because it is what makes two branches' edits merge - see ./simWorldMerge.test.ts
 * for the git proof that rests on it.
 */
import chalk from 'chalk';
chalk.level = 0;

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatSimModuleFile,
  formatSimWorldConfig,
  readSimWorld,
  resolveSimWorldPath,
  SIM_WORLD_CONFIG_FILENAME,
  SIM_WORLD_DIRNAME,
  validateSimWorldTree,
  type SimModule,
  type SimWorldFile,
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

/** The three-module world the design's section 1 example describes. */
function validModules(): SimModule[] {
  return [
    {
      path: 'src/components/SharedButton.tsx',
      content: 'SharedButton v1',
      imports: [],
      stories: [],
    },
    {
      path: 'src/components/ProductCard.tsx',
      content: 'ProductCard v1',
      imports: ['src/components/SharedButton.tsx'],
      stories: [],
    },
    {
      path: 'src/components/ProductCard.stories.tsx',
      content: 'story shell',
      imports: ['src/components/ProductCard.tsx'],
      stories: [
        {
          id: 'productcard--basic',
          title: 'Storefront/ProductCard',
          name: 'Basic',
          render: { text: 'Sherlo Widget', bg: '#ffffff' },
        },
      ],
    },
  ];
}

/** The canonical tree for those modules, as files. */
function validTree(modules: SimModule[] = validModules()): SimWorldFile[] {
  return [
    {
      relativePath: SIM_WORLD_CONFIG_FILENAME,
      text: formatSimWorldConfig({ simVersion: 1, run: { outcome: 'ok' } }),
    },
    ...modules.map((module) => ({
      relativePath: `${module.path}.json`,
      text: formatSimModuleFile(module),
    })),
  ];
}

/** Validate a tree and return the problem list (empty for a valid world). */
function problemsOf(files: SimWorldFile[]): string[] {
  return validateSimWorldTree(files).problems;
}

/** Replace one file's bytes, keeping the rest of the tree canonical. */
function withFile(files: SimWorldFile[], relativePath: string, text: string): SimWorldFile[] {
  return [...files.filter((file) => file.relativePath !== relativePath), { relativePath, text }];
}

/** Write a tree to disk under `tempDir/sim-world`. */
function writeTree(files: SimWorldFile[]): string {
  const dirPath = path.join(tempDir, SIM_WORLD_DIRNAME);

  for (const file of files) {
    const absolute = path.join(dirPath, file.relativePath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, file.text, 'utf8');
  }

  return dirPath;
}

describe('the canonical form', () => {
  it("puts every value on its own line, in the format's key order", () => {
    const text = formatSimModuleFile(validModules()[2]);

    expect(text).toBe(
      `{
  "content": "story shell",

  "imports": [
    "src/components/ProductCard.tsx"
  ],

  "stories": [
    {
      "id": "productcard--basic",

      "title": "Storefront/ProductCard",

      "name": "Basic",

      "render": {
        "text": "Sherlo Widget",

        "bg": "#ffffff"
      }
    }
  ]
}
`
    );
  });

  // The blank line is the whole point: git conflicts on changed lines that
  // merely touch, so two branches editing a story's copy and its ground would
  // collide without one. This asserts the property rather than the spelling, so
  // it also covers fields this format does not have yet.
  it('never leaves two value lines adjacent', () => {
    const text = formatSimModuleFile(validModules()[2]);
    const lines = text.split('\n');

    // A value line is one an author can edit on its own: not blank, and not a
    // bracket that merely opens or closes a structure.
    const carriesValue = (line: string): boolean => {
      const withoutComma = line.endsWith(',') ? line.slice(0, -1) : line;
      return withoutComma.trim() !== '' && !/[{[\]}]$/.test(withoutComma);
    };

    for (let index = 1; index < lines.length; index++) {
      if (carriesValue(lines[index]) && carriesValue(lines[index - 1])) {
        throw new Error(`lines ${index} and ${index + 1} are both values:\n${text}`);
      }
    }
  });

  it('omits an empty `imports` and an empty `stories` rather than spelling them', () => {
    expect(formatSimModuleFile(validModules()[0])).toBe('{\n  "content": "SharedButton v1"\n}\n');
  });

  it('round-trips: a canonical tree validates, and re-formats to the same bytes', () => {
    const result = validateSimWorldTree(validTree());

    expect(result.problems).toEqual([]);
    expect(result.world).not.toBeNull();

    for (const module of result.world!.modules) {
      const file = validTree().find((entry) => entry.relativePath === `${module.path}.json`);
      expect(formatSimModuleFile(module)).toBe(file!.text);
    }
  });
});

describe('validateSimWorldTree', () => {
  it('accepts the design-section-1 example world', () => {
    const result = validateSimWorldTree(validTree());

    expect(result.problems).toEqual([]);
    expect(result.world!.modules.map((module) => module.path)).toEqual([
      'src/components/ProductCard.stories.tsx',
      'src/components/ProductCard.tsx',
      'src/components/SharedButton.tsx',
    ]);
  });

  it('names a wrong simVersion with the value it saw', () => {
    const files = withFile(
      validTree(),
      SIM_WORLD_CONFIG_FILENAME,
      '{\n  "simVersion": 2,\n\n  "run": {\n    "outcome": "ok"\n  }\n}\n'
    );

    expect(problemsOf(files).join('\n')).toContain('`simVersion` must be the number 1 (got 2)');
  });

  it('refuses a world with no config file', () => {
    const files = validTree().filter((file) => file.relativePath !== SIM_WORLD_CONFIG_FILENAME);

    expect(problemsOf(files)).toEqual(['the world has no world.json']);
  });

  it('reports EVERY problem at once, not just the first', () => {
    const files = [
      {
        relativePath: SIM_WORLD_CONFIG_FILENAME,
        text: formatSimWorldConfig({ simVersion: 1, run: { outcome: 'ok' } }),
      },
      { relativePath: 'src/a.tsx.json', text: '{ "content": 42 }' },
      {
        relativePath: 'src/b.stories.tsx.json',
        text: '{ "content": "b", "imports": "nope", "stories": [{ "id": "", "render": {} }] }',
      },
    ];

    const joined = problemsOf(files).join('\n');
    expect(joined).toContain('src/a.tsx.json must have string `content`');
    expect(joined).toContain('src/b.stories.tsx.json `imports` must be a non-empty array');
    expect(joined).toContain('`id`');
    expect(joined).toContain('`render` object with string `text`');
  });

  it('refuses an import that no file declares, naming the importer and the path', () => {
    const modules = validModules();
    modules[1].imports = ['src/components/Ghost.tsx'];

    expect(problemsOf(validTree(modules))).toEqual([
      'src/components/ProductCard.tsx.json imports "src/components/Ghost.tsx", which no file declares',
    ]);
  });

  it('refuses one story id declared by two files, naming both', () => {
    const modules = validModules();
    modules[1].stories = [{ ...modules[2].stories[0] }];

    expect(problemsOf(validTree(modules)).join('\n')).toContain(
      'story id "productcard--basic" is declared by both src/components/ProductCard.stories.tsx ' +
        'and src/components/ProductCard.tsx'
    );
  });

  it('refuses a file that is not named `<module path>.json`', () => {
    const files = [...validTree(), { relativePath: 'src/README.md', text: 'hi' }];

    expect(problemsOf(files).join('\n')).toContain('src/README.md is not a module file');
  });

  it('refuses a non-portable module path with the reason', () => {
    const files = [...validTree(), { relativePath: 'src/../escape.tsx.json', text: '{}' }];

    expect(problemsOf(files).join('\n')).toContain(
      'names a module path that contains a `.` or `..` segment'
    );
  });

  it('accepts every run outcome the executor understands, and refuses the rest', () => {
    for (const outcome of ['ok', 'crash-on-launch', 'system-error'] as const) {
      const files = withFile(
        validTree(),
        SIM_WORLD_CONFIG_FILENAME,
        formatSimWorldConfig({ simVersion: 1, run: { outcome } })
      );
      expect(problemsOf(files)).toEqual([]);
    }

    const files = withFile(
      validTree(),
      SIM_WORLD_CONFIG_FILENAME,
      '{\n  "simVersion": 1,\n\n  "run": {\n    "outcome": "explode"\n  }\n}\n'
    );
    expect(problemsOf(files).join('\n')).toContain('`run.outcome` "explode" is not recognized');
  });

  // The executor's own renderer refuses anything else, so accepting it here
  // would only move the refusal somewhere the fixture author cannot see it.
  it('refuses a `render.bg` that is not `#rrggbb`, as the executor does', () => {
    const modules = validModules();
    modules[2].stories[0].render.bg = 'white';

    expect(problemsOf(validTree(modules)).join('\n')).toContain(
      '`render.bg` must be a `#rrggbb` colour'
    );
  });

  it('takes `error: true` on the story, and refuses `false` as a second spelling', () => {
    const modules = validModules();
    modules[2].stories[0].error = true;

    const result = validateSimWorldTree(validTree(modules));
    expect(result.problems).toEqual([]);
    expect(result.world!.modules[0].stories[0].error).toBe(true);

    const files = withFile(
      validTree(),
      'src/components/ProductCard.stories.tsx.json',
      formatSimModuleFile(modules[2]).replace('"error": true', '"error": false')
    );
    expect(problemsOf(files).join('\n')).toContain('`error` must be `true` when present');
  });
});

// Formatting drift is not a style problem here - a variant re-serialized with
// different whitespace ships a semantic one-line change as a forty-line diff
// that conflicts with everything. So the bytes are checked, not trusted.
describe('non-canonical bytes', () => {
  it('refuses a module file whose values were re-serialized onto shared lines', () => {
    const files = withFile(
      validTree(),
      'src/components/ProductCard.tsx.json',
      '{ "content": "ProductCard v1", "imports": ["src/components/SharedButton.tsx"] }'
    );

    expect(problemsOf(files).join('\n')).toContain(
      'src/components/ProductCard.tsx.json is not in canonical form'
    );
  });

  it('refuses a module file that merely lost its blank lines', () => {
    const canonical = formatSimModuleFile(validModules()[2]);
    const files = withFile(
      validTree(),
      'src/components/ProductCard.stories.tsx.json',
      canonical.replace(/\n\n/g, '\n')
    );

    expect(problemsOf(files).join('\n')).toContain('is not in canonical form');
  });

  it('refuses unsorted imports and unsorted stories', () => {
    const modules = validModules();
    modules[2].imports = ['src/components/SharedButton.tsx', 'src/components/ProductCard.tsx'];

    const files = validTree(modules);
    // formatSimModuleFile emits what it is given, so the tree carries the
    // unsorted spelling and the reader is the one that refuses it.
    expect(problemsOf(files).join('\n')).toContain('`imports` must be sorted');
  });
});

describe('readSimWorld', () => {
  it('reads the tree from disk and normalizes it', () => {
    const dirPath = writeTree(validTree());

    const world = readSimWorld(dirPath);

    expect(world.dirPath).toBe(dirPath);
    expect(world.parsed.modules[0].stories[0].id).toBe('productcard--basic');
    expect(world.parsed.run.outcome).toBe('ok');
  });

  it('names the path when the world is not a directory', () => {
    const filePath = path.join(tempDir, 'sim-world.json');
    fs.writeFileSync(filePath, '{}', 'utf8');

    expect(() => readSimWorld(filePath)).toThrow(/is not a directory/);
  });

  it('says invalid JSON is invalid JSON, naming the file', () => {
    const dirPath = writeTree(withFile(validTree(), 'src/broken.tsx.json', '{ not json'));

    expect(() => readSimWorld(dirPath)).toThrow(/src\/broken\.tsx\.json is not valid JSON/);
  });

  it('lists every problem in the thrown message', () => {
    const modules = validModules();
    modules[1].imports = ['src/components/Ghost.tsx'];
    const files = withFile(
      validTree(modules),
      SIM_WORLD_CONFIG_FILENAME,
      '{\n  "simVersion": 9,\n\n  "run": {\n    "outcome": "ok"\n  }\n}\n'
    );

    expect(() => readSimWorld(writeTree(files))).toThrow(
      /simVersion[\s\S]*Ghost\.tsx[\s\S]*which no file declares/
    );
  });
});

describe('resolveSimWorldPath', () => {
  it('prefers the explicit --sim path and marks it explicit', () => {
    expect(resolveSimWorldPath({ sim: '/worlds/w', projectRoot: tempDir })).toEqual({
      dirPath: '/worlds/w',
      explicit: true,
    });
  });

  it('detects sim-world/ in the project root', () => {
    fs.mkdirSync(path.join(tempDir, SIM_WORLD_DIRNAME));

    expect(resolveSimWorldPath({ projectRoot: tempDir })).toEqual({
      dirPath: path.join(tempDir, SIM_WORLD_DIRNAME),
      explicit: false,
    });
  });

  it('returns undefined when neither the flag nor the directory is present', () => {
    expect(resolveSimWorldPath({ projectRoot: tempDir })).toBeUndefined();
  });
});
