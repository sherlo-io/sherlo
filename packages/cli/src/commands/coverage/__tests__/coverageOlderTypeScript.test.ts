/**
 * THE COVERAGE COMMAND, ON A TYPESCRIPT OLDER THAN 7 - an app written to a folder, because the
 * classic compiler reads a disk, and read through the repo's TypeScript 5. It has its own file
 * so each coverage test file stays inside the five-second limit.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as classicTypeScript from 'typescript-5';
import { describe, expect, it } from 'vitest';
import { classicComponentTypes } from '../../../seams/coverageScan';
import type { SourceFile } from '../componentGaps';
import { storyPropValues } from '../storyPropValues';

const APP: SourceFile[] = [
  {
    // The story files are left out of this program, as many apps' tsconfig.json do.
    path: 'tsconfig.json',
    text: '{ "compilerOptions": { "jsx": "preserve", "strict": true, "lib": ["es5"], "types": [] }, "exclude": ["**/*.stories.tsx"] }',
  },
  {
    path: 'src/Avatar.tsx',
    text: [
      "type Size = 'xs' | 'sm' | 'md' | 'lg';",
      'export function Avatar(props: { size?: Size; isRound?: boolean; label: string }) { return null; }',
    ].join('\n'),
  },
  {
    path: 'src/Avatar.stories.tsx',
    text: [
      "import { Avatar } from './Avatar';",
      "export default { component: Avatar, args: { size: 'md' } };",
      "export const Large = { args: { size: 'lg', isRound: true } };",
    ].join('\n'),
  },
];

describe('sherlo coverage --props on an app with an older TypeScript', () => {
  it('reads prop values with a TypeScript older than 7', () => {
    // It names the missing values in the order the Size alias declares them, though the
    // tsconfig.json leaves the story file out of its program.
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-coverage-'));
    for (const file of APP) {
      fs.mkdirSync(path.dirname(path.join(folder, file.path)), { recursive: true });
      fs.writeFileSync(path.join(folder, file.path), file.text);
    }
    try {
      const types = classicComponentTypes(
        classicTypeScript as unknown as Parameters<typeof classicComponentTypes>[0],
        { root: fs.realpathSync(folder) }
      );
      expect(storyPropValues({ files: APP, types })).toEqual({
        storyFiles: 1,
        components: [
          {
            name: 'Avatar',
            file: 'src/Avatar.tsx',
            props: [
              { prop: 'size', allowed: 4, set: 2, missing: ['"xs"', '"sm"'] },
              { prop: 'isRound', allowed: 2, set: 1, missing: ['false'] },
            ],
          },
        ],
      });
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});
