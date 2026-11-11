import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { firstLookOf } from '../firstLook';

const appFolders: string[] = [];

/** An app folder holding these story files, each last changed this many seconds after the epoch. */
function appWith(changedAt: Record<string, number>): string {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'first-look-'));
  appFolders.push(projectRoot);
  for (const [file, seconds] of Object.entries(changedAt)) {
    fs.mkdirSync(path.dirname(path.join(projectRoot, file)), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, file), '');
    fs.utimesSync(path.join(projectRoot, file), seconds, seconds);
  }
  return projectRoot;
}

/** A module map whose bundle holds these files. */
function manifestOf(files: string[]): any {
  return {
    raw: Buffer.from('{}'),
    parsed: {
      version: 1,
      header: {},
      moduleHashes: {},
      storyClosures: Object.fromEntries(files.map((file) => [file, []])),
    },
  };
}

afterEach(() => {
  for (const folder of appFolders.splice(0)) fs.rmSync(folder, { recursive: true, force: true });
});

describe('the first look a push names', () => {
  it('names the three story files changed last, of both platforms, newest first', () => {
    const projectRoot = appWith({
      'src/A.stories.tsx': 100,
      'src/B.stories.tsx': 400,
      'src/C.stories.tsx': 200,
      'src/D.stories.tsx': 300,
    });

    const firstLook = firstLookOf({
      allStories: undefined,
      projectRoot,
      moduleManifests: {
        android: manifestOf(['src/A.stories.tsx', 'src/B.stories.tsx']),
        ios: manifestOf(['src/B.stories.tsx', 'src/C.stories.tsx', 'src/D.stories.tsx']),
      },
    });

    expect(firstLook).toEqual({
      storyFilePaths: ['src/B.stories.tsx', 'src/D.stories.tsx', 'src/C.stories.tsx'],
    });
  });

  it('names none for a bundle with no story file', () => {
    expect(
      firstLookOf({ allStories: undefined, projectRoot: '/no/such/app', moduleManifests: {} })
    ).toBeUndefined();
  });
});
