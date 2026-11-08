import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { declaresProductFlavors, flavorReleaseTasksIn } from '../androidFlavors';

let projectRoot: string;

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-android-flavors-'));
  fs.mkdirSync(path.join(projectRoot, 'android/app'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

describe('android flavors', () => {
  it('sees product flavors in build.gradle or build.gradle.kts', () => {
    expect(declaresProductFlavors(projectRoot)).toBe(false);
    fs.writeFileSync(path.join(projectRoot, 'android/app/build.gradle'), 'android { }');
    expect(declaresProductFlavors(projectRoot)).toBe(false);
    fs.writeFileSync(
      path.join(projectRoot, 'android/app/build.gradle.kts'),
      'android { productFlavors { } }'
    );
    expect(declaresProductFlavors(projectRoot)).toBe(true);
  });

  it('keeps only the flavor release assemble tasks of the task list', () => {
    const output = [
      'assemble - Assembles all variants of all applications.',
      'assembleRelease - Assembles all Release builds.',
      'assembleDevRelease - Assembles main outputs for all DevRelease variants.',
      'assembleDevDebug - Assembles main outputs for all DevDebug variants.',
      'assembleProdRelease - Assembles main outputs for all ProdRelease variants.',
      'assembleProdRelease - Listed twice.',
    ].join('\n');
    expect(flavorReleaseTasksIn(output)).toEqual([
      ':app:assembleDevRelease',
      ':app:assembleProdRelease',
    ]);
  });
});
