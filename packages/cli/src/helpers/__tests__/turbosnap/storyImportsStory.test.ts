import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkStoryImportsStory } from '../../turbosnap/storyImportsStory';

// ---------------------------------------------------------------------------
// Minimal filesystem fixture
// ---------------------------------------------------------------------------

class FsFixture {
  readonly dir: string;

  constructor() {
    this.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-story-fixture-'));
  }

  write(relPath: string, content: string): void {
    const abs = path.join(this.dir, relPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
  }

  cleanup(): void {
    fs.rmSync(this.dir, { recursive: true, force: true });
  }

  /** Returns a changedFiles path relative to fixture.dir (mirrors git diff output). */
  rel(relPath: string): string {
    return relPath;
  }
}

let fx: FsFixture;

beforeEach(() => {
  fx = new FsFixture();
});

afterEach(() => {
  fx.cleanup();
});

// ---------------------------------------------------------------------------
// (a) Direct story->story import: StoryA imports './StoryB.stories'
// ---------------------------------------------------------------------------

describe('(a) direct story->story import', () => {
  it('returns fullRun when a changed story file is imported by another story file', () => {
    // StoryB (changed) is imported by StoryA.
    fx.write('StoryB.stories.tsx', `export const Primary = () => null;`);
    fx.write(
      'StoryA.stories.tsx',
      `import { Primary } from './StoryB.stories';
export default { title: 'A' };`
    );

    const result = checkStoryImportsStory(fx.dir, [fx.rel('StoryB.stories.tsx')]);

    expect(result).toMatchObject({
      fullRun: true,
      reason: expect.stringMatching(/story-imports-story/),
    });
    const r = result as { fullRun: true; reason: string };
    expect(r.reason).toMatch('StoryB.stories.tsx');
    expect(r.reason).toMatch('StoryA.stories.tsx');
  });

  it('includes the changed story file name in the reason', () => {
    fx.write('Button.stories.tsx', `export const Primary = () => null;`);
    fx.write(
      'Composite.stories.tsx',
      `import { Primary } from './Button.stories';
export default { title: 'Composite' };`
    );

    const result = checkStoryImportsStory(fx.dir, ['Button.stories.tsx']) as {
      fullRun: true;
      reason: string;
    };

    expect(result.fullRun).toBe(true);
    expect(result.reason).toContain('Button.stories.tsx');
    expect(result.reason).toContain('Composite.stories.tsx');
  });
});

// ---------------------------------------------------------------------------
// (b) Transitive story->story import: A imports B imports C; C changed
// ---------------------------------------------------------------------------

describe('(b) transitive story->story chain', () => {
  it('returns fullRun when a changed story is imported transitively through another story', () => {
    // A.stories -> B.stories -> C.stories (C changed)
    fx.write('C.stories.tsx', `export const C = () => null;`);
    fx.write('B.stories.tsx', `import { C } from './C.stories'; export const B = () => null;`);
    fx.write('A.stories.tsx', `import { B } from './B.stories'; export const A = () => null;`);

    // C.stories is changed; B directly imports C - force full.
    const result = checkStoryImportsStory(fx.dir, ['C.stories.tsx']);

    expect(result).toMatchObject({ fullRun: true });
    const r = result as { fullRun: true; reason: string };
    expect(r.reason).toMatch(/story-imports-story/);
    expect(r.reason).toMatch('C.stories.tsx');
  });
});

// ---------------------------------------------------------------------------
// (c) Common fast path: no story->story imports
// ---------------------------------------------------------------------------

describe('(c) no story->story imports - common fast path', () => {
  it('returns { changedFiles } unchanged when stories only import non-story files', () => {
    // Button component (not a story file)
    fx.write('Button.tsx', `export const Button = () => null;`);
    // Button story imports Button component - NOT a story->story import
    fx.write(
      'Button.stories.tsx',
      `import { Button } from './Button';
export default { title: 'Button' };
export const Primary = () => <Button />;`
    );

    const changed = ['Button.stories.tsx'];
    const result = checkStoryImportsStory(fx.dir, changed);

    expect(result).toEqual({ changedFiles: changed });
  });

  it('returns { changedFiles } when no stories import each other at all', () => {
    fx.write('A.stories.tsx', `export default { title: 'A' };`);
    fx.write('B.stories.tsx', `export default { title: 'B' };`);

    const changed = ['A.stories.tsx', 'B.stories.tsx'];
    const result = checkStoryImportsStory(fx.dir, changed);

    expect(result).toEqual({ changedFiles: changed });
  });

  it('returns { changedFiles } when no story files are in changedFiles', () => {
    fx.write('Button.tsx', `export const Button = () => null;`);
    fx.write(
      'Button.stories.tsx',
      `import { Button } from './Button'; export default { title: 'Button' };`
    );

    const changed = ['Button.tsx'];
    const result = checkStoryImportsStory(fx.dir, changed);

    expect(result).toEqual({ changedFiles: changed });
  });

  it('returns { changedFiles } with non-story file changes alongside story changes when no cross-imports exist', () => {
    fx.write('Button.tsx', `export const Button = () => null;`);
    fx.write(
      'Button.stories.tsx',
      `import { Button } from './Button'; export default { title: 'Button' };`
    );
    fx.write('Modal.stories.tsx', `export default { title: 'Modal' };`);

    const changed = ['Button.tsx', 'Button.stories.tsx'];
    const result = checkStoryImportsStory(fx.dir, changed);

    expect(result).toEqual({ changedFiles: changed });
  });
});

// ---------------------------------------------------------------------------
// (d) Bail-open on unresolvable story-looking specifier
// ---------------------------------------------------------------------------

describe('(d) bail-open on unresolvable story-looking import', () => {
  it('returns fullRun when a story file has an unresolvable import that looks like a story', () => {
    // StoryA has an import of a story file that does not exist on disk.
    fx.write(
      'StoryA.stories.tsx',
      `import { Primary } from './NonExistent.stories';
export default { title: 'A' };`
    );

    // StoryA itself is changed (so there is a changed story file to trigger the scan).
    const result = checkStoryImportsStory(fx.dir, ['StoryA.stories.tsx']);

    expect(result).toMatchObject({ fullRun: true });
  });

  it('returns fullRun when an extension-less story specifier cannot be resolved', () => {
    // The import looks like a story file (contains .stories) but no file exists.
    fx.write(
      'Importer.stories.tsx',
      `import something from './Missing.stories';
export default { title: 'Importer' };`
    );

    const result = checkStoryImportsStory(fx.dir, ['Importer.stories.tsx']);

    expect(result).toMatchObject({ fullRun: true });
  });

  it('does NOT bail for unresolvable non-story imports', () => {
    // ./helper does not exist, but it cannot be a story file -> safe to skip.
    fx.write(
      'StoryA.stories.tsx',
      `import { helper } from './helper';
export default { title: 'A' };`
    );

    const changed = ['StoryA.stories.tsx'];
    const result = checkStoryImportsStory(fx.dir, changed);

    // Should not bail - no story->story edge and no story-looking unresolvable import.
    expect(result).toEqual({ changedFiles: changed });
  });
});

// ---------------------------------------------------------------------------
// (e) Extension-less specifier resolution
// ---------------------------------------------------------------------------

describe('(e) extension-less specifier resolution', () => {
  it("resolves './Button.stories' to Button.stories.tsx correctly", () => {
    // The spec uses no extension; the actual file has .tsx.
    fx.write('Button.stories.tsx', `export const Primary = () => null;`);
    fx.write(
      'Composite.stories.tsx',
      `import { Primary } from './Button.stories';
export default { title: 'Composite' };`
    );

    const result = checkStoryImportsStory(fx.dir, ['Button.stories.tsx']);

    expect(result).toMatchObject({ fullRun: true });
    const r = result as { fullRun: true; reason: string };
    expect(r.reason).toContain('Button.stories.tsx');
  });

  it("resolves './Button.stories' to Button.stories.ts (no x) correctly", () => {
    fx.write('Button.stories.ts', `export const Primary = () => null;`);
    fx.write(
      'Composite.stories.tsx',
      `import { Primary } from './Button.stories';
export default { title: 'Composite' };`
    );

    const result = checkStoryImportsStory(fx.dir, ['Button.stories.ts']);

    expect(result).toMatchObject({ fullRun: true });
  });

  it('does NOT bail for extension-less non-story specifier that resolves to a non-story file', () => {
    fx.write('utils.ts', `export const helper = () => null;`);
    fx.write(
      'StoryA.stories.tsx',
      `import { helper } from './utils';
export default { title: 'A' };`
    );

    const changed = ['StoryA.stories.tsx'];
    const result = checkStoryImportsStory(fx.dir, changed);

    // utils.ts resolves fine but is not a story file - fast path preserved.
    expect(result).toEqual({ changedFiles: changed });
  });

  it('handles require() calls with extension-less story specifiers', () => {
    fx.write('Button.stories.tsx', `module.exports = { Primary: () => null };`);
    fx.write(
      'Composite.stories.jsx',
      `const { Primary } = require('./Button.stories');
module.exports = { default: { title: 'Composite' } };`
    );

    const result = checkStoryImportsStory(fx.dir, ['Button.stories.tsx']);

    expect(result).toMatchObject({ fullRun: true });
  });
});

// ---------------------------------------------------------------------------
// (f) Path-aliased imports of story files -> bail-open
// ---------------------------------------------------------------------------

describe('(f) path-aliased story imports - bail-open', () => {
  it('returns fullRun when a story has an aliased import that looks like a story file', () => {
    // StoryA uses a path alias (@/components/Base.stories) - the alias cannot
    // be resolved on disk, but the specifier matches the story-file pattern.
    // We cannot rule out a hidden story->story edge, so we force full.
    fx.write('Base.stories.tsx', `export const Primary = () => null;`);
    fx.write(
      'StoryA.stories.tsx',
      `import { Primary } from '@/components/Base.stories';
export default { title: 'A' };`
    );

    // StoryA itself is changed; the aliased import bails open.
    const result = checkStoryImportsStory(fx.dir, ['StoryA.stories.tsx']);

    expect(result).toMatchObject({ fullRun: true });
    const r = result as { fullRun: true; reason: string };
    expect(r.reason).toMatch(/story-imports-story/);
  });

  it('does NOT bail for an aliased import that cannot be a story file', () => {
    // '@/components/SharedButton' has no .stories in the path -> resolveSpecifier
    // returns null -> fast path preserved.
    fx.write(
      'StoryA.stories.tsx',
      `import { SharedButton } from '@/components/SharedButton';
export default { title: 'A' };`
    );

    const changed = ['StoryA.stories.tsx'];
    const result = checkStoryImportsStory(fx.dir, changed);

    expect(result).toEqual({ changedFiles: changed });
  });
});

// ---------------------------------------------------------------------------
// (g) Dynamic imports of story files -> story->story edge
// ---------------------------------------------------------------------------

describe('(g) dynamic imports of story files', () => {
  it('returns fullRun when a story dynamically imports a changed story file', () => {
    // Base.stories is changed; StoryA dynamically imports it.
    // The dynamic import creates a story->story edge so editing Base forces full.
    fx.write('Base.stories.tsx', `export const Primary = () => null;`);
    fx.write(
      'StoryA.stories.tsx',
      `export const Lazy = () => import('./Base.stories');
export default { title: 'A' };`
    );

    const result = checkStoryImportsStory(fx.dir, ['Base.stories.tsx']);

    expect(result).toMatchObject({ fullRun: true });
    const r = result as { fullRun: true; reason: string };
    expect(r.reason).toMatch(/story-imports-story/);
    expect(r.reason).toContain('Base.stories.tsx');
  });
});

// ---------------------------------------------------------------------------
// (h) Barrel re-export detection (one level)
// ---------------------------------------------------------------------------

describe('(h) barrel re-export detection', () => {
  it('forces full when a non-story barrel re-exports a changed story imported by a story', () => {
    // Base.stories (changed) is re-exported by index.ts (barrel).
    // Composed.stories imports from the barrel, not directly from Base.stories.
    fx.write('Base.stories.tsx', `export const Primary = () => null;`);
    fx.write('index.ts', `export { Primary } from './Base.stories';`);
    fx.write(
      'Composed.stories.tsx',
      `import { Primary } from './index';
export default { title: 'Composed' };`
    );

    const result = checkStoryImportsStory(fx.dir, ['Base.stories.tsx']);

    expect(result).toMatchObject({ fullRun: true });
    const r = result as { fullRun: true; reason: string };
    expect(r.reason).toMatch(/story-imports-story/);
  });

  it('does not bail when a barrel re-exports only a non-story component', () => {
    // index.ts forwards Button.tsx (not a story) - no story->story edge via barrel.
    fx.write('Button.tsx', `export const Button = () => null;`);
    fx.write('index.ts', `export { Button } from './Button';`);
    fx.write(
      'StoryA.stories.tsx',
      `import { Button } from './index';
export default { title: 'A' };`
    );
    // An unrelated leaf story is the only changed file.
    fx.write('Leaf.stories.tsx', `export default { title: 'Leaf' };`);

    const changed = ['Leaf.stories.tsx'];
    const result = checkStoryImportsStory(fx.dir, changed);

    expect(result).toEqual({ changedFiles: changed });
  });

  it('does not bail when a barrel forwards a non-changed story', () => {
    // index.ts re-exports Base.stories, but Base.stories is NOT in changedFiles.
    // Only LeafStory is changed - the barrel path is harmless.
    fx.write('Base.stories.tsx', `export const Primary = () => null;`);
    fx.write('index.ts', `export { Primary } from './Base.stories';`);
    fx.write(
      'Composed.stories.tsx',
      `import { Primary } from './index';
export default { title: 'Composed' };`
    );
    fx.write('LeafStory.stories.tsx', `export default { title: 'Leaf' };`);

    const changed = ['LeafStory.stories.tsx'];
    const result = checkStoryImportsStory(fx.dir, changed);

    expect(result).toEqual({ changedFiles: changed });
  });

  it('forces full when a barrel contains an aliased re-export that looks like a story file', () => {
    // index.ts has `export { P } from '@/Base.stories'` - the alias cannot be
    // resolved on disk but is story-looking. The same bail rule applied in the
    // main loop applies uniformly inside the barrel scan.
    fx.write('index.ts', `export { P } from '@/Base.stories';`);
    fx.write(
      'StoryA.stories.tsx',
      `import { P } from './index';
export default { title: 'A' };`
    );

    // StoryA is changed so the scan runs.
    const result = checkStoryImportsStory(fx.dir, ['StoryA.stories.tsx']);

    expect(result).toMatchObject({ fullRun: true });
    const r = result as { fullRun: true; reason: string };
    expect(r.reason).toMatch(/story-imports-story/);
  });
});

// ---------------------------------------------------------------------------
// Additional edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('ignores node_modules directory when scanning for story files', () => {
    // A story file inside node_modules must not be part of the graph.
    fx.write(
      'node_modules/some-lib/Foo.stories.tsx',
      `import { Bar } from '../../Bar.stories'; export default {};`
    );
    fx.write('Bar.stories.tsx', `export default { title: 'Bar' };`);

    const changed = ['Bar.stories.tsx'];
    const result = checkStoryImportsStory(fx.dir, changed);

    // node_modules story is excluded, so no importer found - fast path.
    expect(result).toEqual({ changedFiles: changed });
  });

  it('returns { changedFiles } when changedFiles is empty', () => {
    fx.write('A.stories.tsx', `import { B } from './B.stories'; export default {};`);
    fx.write('B.stories.tsx', `export default {};`);

    const result = checkStoryImportsStory(fx.dir, []);

    expect(result).toEqual({ changedFiles: [] });
  });

  it('handles stories in subdirectories', () => {
    fx.write('components/Button.stories.tsx', `export const Primary = () => null;`);
    fx.write(
      'screens/Home.stories.tsx',
      `import { Primary } from '../components/Button.stories';
export default { title: 'Home' };`
    );

    const result = checkStoryImportsStory(fx.dir, ['components/Button.stories.tsx']);

    expect(result).toMatchObject({ fullRun: true });
    const r = result as { fullRun: true; reason: string };
    expect(r.reason).toContain('Button.stories.tsx');
  });
});
