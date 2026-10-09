'use strict';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// The race guard withStorybook.js runs before it delegates to
// @storybook/react-native. Required directly so the test never has to resolve
// the Storybook peer dep - the child-process generator is injected as a seam.
const ensureStorybookRequires = require('../../metro/ensureStorybookRequires');

type GenerateOptions = { configPath: string; useJs: boolean; docTools: boolean };

/** A generator stub that records its calls and writes what the real one writes. */
function makeGeneratorSpy(behavior?: (options: GenerateOptions) => void) {
  const calls: GenerateOptions[] = [];
  const spy = (options: GenerateOptions) => {
    calls.push(options);
    if (behavior) {
      behavior(options);
      return;
    }
    const extension = options.useJs ? '.js' : '.ts';
    fs.writeFileSync(path.join(options.configPath, 'storybook.requires' + extension), '// stub');
  };
  return { spy, calls };
}

/**
 * Runs the guard on a throwaway project directory. The guard resolves the config
 * directory in the project root it is given, never in the process cwd, so the
 * cwd is left where it is: a guard that read it would find no config there.
 */
function inProject(setUp: (projectRoot: string) => void, run: (projectRoot: string) => void): void {
  const projectRoot = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-requires-test-'))
  );
  try {
    setUp(projectRoot);
    run(projectRoot);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Missing file - the branch that closes the race
// ---------------------------------------------------------------------------

describe('ensureStorybookRequires - storybook.requires is missing', () => {
  it('generates the file before returning', () => {
    inProject(
      (projectRoot) => fs.mkdirSync(path.join(projectRoot, '.rnstorybook')),
      (projectRoot) => {
        const { spy, calls } = makeGeneratorSpy();
        const requiresPath = path.join(projectRoot, '.rnstorybook', 'storybook.requires.ts');

        expect(fs.existsSync(requiresPath)).toBe(false);
        const generated = ensureStorybookRequires(projectRoot, {}, spy);

        expect(generated).toBe(true);
        expect(calls).toHaveLength(1);
        // The file is on disk by the time the guard hands control back - that is
        // the whole point: Metro must never crawl before the write lands.
        expect(fs.existsSync(requiresPath)).toBe(true);
      }
    );
  });

  it('passes upstream defaults (TypeScript output, doc tools on) to the generator', () => {
    inProject(
      (projectRoot) => fs.mkdirSync(path.join(projectRoot, '.rnstorybook')),
      (projectRoot) => {
        const { spy, calls } = makeGeneratorSpy();
        ensureStorybookRequires(projectRoot, undefined, spy);

        expect(calls[0]).toEqual({
          configPath: path.join(projectRoot, '.rnstorybook'),
          useJs: false,
          docTools: true,
        });
      }
    );
  });

  it('forwards useJs and docTools when the caller set them', () => {
    inProject(
      (projectRoot) => fs.mkdirSync(path.join(projectRoot, '.rnstorybook')),
      (projectRoot) => {
        const { spy, calls } = makeGeneratorSpy();
        ensureStorybookRequires(projectRoot, { useJs: true, docTools: false }, spy);

        expect(calls[0].useJs).toBe(true);
        expect(calls[0].docTools).toBe(false);
      }
    );
  });

  it('honours an explicit configPath', () => {
    inProject(
      (projectRoot) =>
        fs.mkdirSync(path.join(projectRoot, 'config', 'storybook'), { recursive: true }),
      (projectRoot) => {
        const { spy, calls } = makeGeneratorSpy();
        ensureStorybookRequires(projectRoot, { configPath: './config/storybook' }, spy);

        expect(calls[0].configPath).toBe(path.join(projectRoot, 'config', 'storybook'));
        expect(
          fs.existsSync(path.join(projectRoot, 'config', 'storybook', 'storybook.requires.ts'))
        ).toBe(true);
      }
    );
  });

  it('falls back to a .storybook config directory when .rnstorybook is absent', () => {
    inProject(
      (projectRoot) => fs.mkdirSync(path.join(projectRoot, '.storybook')),
      (projectRoot) => {
        const { spy, calls } = makeGeneratorSpy();
        ensureStorybookRequires(projectRoot, {}, spy);

        expect(calls[0].configPath).toBe(path.join(projectRoot, '.storybook'));
      }
    );
  });

  it('does not throw when the generator fails - upstream still gets its turn', () => {
    inProject(
      (projectRoot) => fs.mkdirSync(path.join(projectRoot, '.rnstorybook')),
      (projectRoot) => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const { spy } = makeGeneratorSpy(() => {
          throw new Error('generator blew up');
        });

        expect(ensureStorybookRequires(projectRoot, {}, spy)).toBe(false);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
      }
    );
  });
});

// ---------------------------------------------------------------------------
// Existing file - the untouched common case
// ---------------------------------------------------------------------------

describe('ensureStorybookRequires - storybook.requires already exists', () => {
  it('does not run the generator and leaves the file byte-for-byte alone', () => {
    inProject(
      (projectRoot) => {
        fs.mkdirSync(path.join(projectRoot, '.rnstorybook'));
        fs.writeFileSync(
          path.join(projectRoot, '.rnstorybook', 'storybook.requires.ts'),
          '// committed by the user'
        );
      },
      (projectRoot) => {
        const { spy, calls } = makeGeneratorSpy();
        const requiresPath = path.join(projectRoot, '.rnstorybook', 'storybook.requires.ts');

        expect(ensureStorybookRequires(projectRoot, {}, spy)).toBe(false);
        expect(calls).toHaveLength(0);
        expect(fs.readFileSync(requiresPath, 'utf8')).toBe('// committed by the user');
      }
    );
  });

  it('treats a .js requires file as present even when useJs was not set', () => {
    inProject(
      (projectRoot) => {
        fs.mkdirSync(path.join(projectRoot, '.rnstorybook'));
        fs.writeFileSync(path.join(projectRoot, '.rnstorybook', 'storybook.requires.js'), '// js');
      },
      (projectRoot) => {
        const { spy, calls } = makeGeneratorSpy();
        expect(ensureStorybookRequires(projectRoot, {}, spy)).toBe(false);
        expect(calls).toHaveLength(0);
      }
    );
  });
});

// ---------------------------------------------------------------------------
// Cases with no race to close
// ---------------------------------------------------------------------------

describe('ensureStorybookRequires - skipped entirely', () => {
  it('skips when Storybook is disabled for this build', () => {
    inProject(
      (projectRoot) => fs.mkdirSync(path.join(projectRoot, '.rnstorybook')),
      (projectRoot) => {
        const { spy, calls } = makeGeneratorSpy();
        expect(ensureStorybookRequires(projectRoot, { enabled: false }, spy)).toBe(false);
        expect(calls).toHaveLength(0);
      }
    );
  });

  it('skips when the project has no Storybook config directory', () => {
    inProject(
      () => undefined,
      (projectRoot) => {
        const { spy, calls } = makeGeneratorSpy();
        expect(ensureStorybookRequires(projectRoot, {}, spy)).toBe(false);
        expect(calls).toHaveLength(0);
      }
    );
  });
});

// ---------------------------------------------------------------------------
// withStorybook.js wiring - structural, so the peer dep is never loaded
// ---------------------------------------------------------------------------

describe('withStorybook.js - race guard wiring', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../metro/withStorybook.js'), 'utf8');

  it('requires the guard', () => {
    expect(source).toContain("require('./ensureStorybookRequires')");
  });

  it('runs the guard BEFORE delegating to the real withStorybook', () => {
    // Both are handed the options after SHERLO_BUILD has had its say (metro/sherloBuild.js).
    const guardIdx = source.indexOf('ensureStorybookRequires(projectRoot, storybookOptions)');
    const delegateIdx = source.indexOf('loadOldSetupStorybookWrapper()(config, storybookOptions)');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(delegateIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(delegateIdx);
  });
});
