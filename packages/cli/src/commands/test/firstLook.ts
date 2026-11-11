/**
 * A PROJECT'S FIRST TEST IS A FIRST LOOK. A first test has nothing to compare against, so it would
 * capture every story, and on a large app that outlasts the wait. So every push names a few story
 * files - the ones changed last - and the server, on a project's first build only, captures those
 * stories plus every scene (the API's decideFirstLook); on any later build it ignores the list.
 * `--all-stories` names none, and the first test takes every story.
 */
import fs from 'fs';
import path from 'path';
import type { Platform } from '@sherlo/api-types';
import { ALL_STORIES_OPTION, WAIT_TIMEOUT_OPTION } from '../../constants';
import type { OpenBuildRequest } from '../../seams/serverCalls';
import { bundleStoryFiles, type ValidatedModuleManifest } from './readModuleManifest';

/** How many story files a first look names: enough to see the app, few enough to come back in minutes. */
const FIRST_LOOK_STORY_FILES = 3;

/**
 * The first look a push names: the story files of its bundles changed last on disk, newest first,
 * as paths relative to the app folder the module map is keyed by. None with `--all-stories`, or
 * when the bundles hold no story file.
 */
export function firstLookOf({
  allStories,
  projectRoot,
  moduleManifests,
}: {
  allStories: boolean | undefined;
  projectRoot: string;
  moduleManifests: Partial<Record<Platform, ValidatedModuleManifest>>;
}): OpenBuildRequest['firstLook'] {
  if (allStories) return undefined;
  const storyFiles = new Set(Object.values(moduleManifests).flatMap(bundleStoryFiles));
  if (storyFiles.size === 0) return undefined;
  const changedAt = (file: string) =>
    fs.statSync(path.join(projectRoot, file), { throwIfNoEntry: false })?.mtimeMs ?? 0;
  const storyFilePaths = [...storyFiles]
    .map((file) => ({ file, changedAt: changedAt(file) }))
    .sort((a, b) => b.changedAt - a.changedAt || a.file.localeCompare(b.file))
    .slice(0, FIRST_LOOK_STORY_FILES)
    .map(({ file }) => file);
  return { storyFilePaths };
}

/** The flags that size a test's first look and its wait, as `sherlo test --help` shows them. */
export const FIRST_LOOK_OPTION_DEFINITION: Record<string, [string, string]> = {
  [ALL_STORIES_OPTION]: [
    '--all-stories',
    "Test every story on the project's first test, instead of a first look at the stories changed last",
  ],
  [WAIT_TIMEOUT_OPTION]: [
    '--wait-timeout <minutes>',
    'Max minutes to wait for results (default: 45, or longer for a test with more pictures). Exit code 3 on timeout.',
  ],
};
