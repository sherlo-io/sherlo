/**
 * THE SIM ROAD PRINTS WHAT A CUSTOMER'S PUSH PRINTS.
 *
 * The Branching storylines walk `sherlo test` on the sim road, and their approved pictures draw what
 * a customer's push prints. So for one fixture project, posed twice - once as a customer's push
 * (a bundle with its module map) and once as the same project declared as a sim world - the two
 * screens must read the same, line for line, apart from each road's own lines: the push's bundling
 * rows and the sim road's header and upload lines.
 *
 * The fixtures are the catalogue's own push poses, so the push side is the screen the catalogue
 * already approves. The sim side is derived from each: the same story files, titles and story
 * counts, written as a sim world, and the same server answers minus the gate the sim road never
 * asks.
 */
import fs from 'fs';
import path from 'path';
import { SIM_WORLD_VERSION } from '@sherlo/api-types';
import { describe, expect, it } from 'vitest';
import { POSES_ROOT } from '../../pose/catalogue';
import { runPose } from '../../pose/pose';
import { readPoseDocument } from '../../pose/readPose';
import type { CommandPose } from '../../../seams/commandPose';
import {
  SIM_MODULE_FILE_SUFFIX,
  SIM_WORLD_CONFIG_FILENAME,
  SIM_WORLD_DIRNAME,
  formatSimModuleFile,
  formatSimWorldConfig,
  type SimModule,
} from '../simWorld';

/** One push with a branching-off warning, one with a history warning, one partial capture. */
const PUSH_POSES = [
  'push-gitlab-no-main-branch-branching-off',
  'push-gitlab-shallow-clone-history-fetch-refused',
  'push-android-wait-names-the-screens',
];

/** The server calls only the push road makes: the sim world has no native base to gate. */
const PUSH_ROAD_ONLY_CALLS = new Set(['checkStagedGate', 'getNextBuildInfo']);

function catalogPushPose(name: string): CommandPose {
  const posePath = path.join(POSES_ROOT, 'test', `${name}.pose.json`);
  return readPoseDocument(fs.readFileSync(posePath, 'utf8'));
}

/**
 * The push pose with its bundles' story files in path order: a sim world is read in path order,
 * and the order a real bundle lists its story files is its bundler's, not the road's.
 */
function inPathOrder(push: CommandPose): CommandPose {
  const bundles = Object.fromEntries(
    Object.entries(push.bundles).map(([platform, bundle]) => [
      platform,
      { ...bundle, storyClosureKeys: [...(bundle.storyClosureKeys ?? [])].sort() },
    ])
  );
  return { ...push, bundles };
}

/** The same project as a sim world: each story file with its title and its number of stories. */
function asSimWorld(push: CommandPose): CommandPose {
  const [bundle] = Object.values(push.bundles);
  const modules: SimModule[] = (bundle.storyClosureKeys ?? []).map((storyFile) => ({
    path: storyFile,
    content: storyFile,
    imports: [],
    stories: Array.from({ length: bundle.storyCounts?.[storyFile] ?? 1 }, (_, index) => ({
      id: `${storyFile}--story-${String(index + 1).padStart(2, '0')}`,
      ...(bundle.storyTitles?.[storyFile] ? { title: bundle.storyTitles[storyFile] } : {}),
      render: { text: storyFile, bg: '#ffffff' },
    })),
  }));

  const config = push.files['sherlo.config.json'] as Record<string, unknown>;
  const files = {
    ...push.files,
    'sherlo.config.json': { ...config, simulation: SIM_WORLD_DIRNAME },
    [`${SIM_WORLD_DIRNAME}/${SIM_WORLD_CONFIG_FILENAME}`]: formatSimWorldConfig({
      simVersion: SIM_WORLD_VERSION,
      run: { outcome: 'ok' },
    }),
    ...Object.fromEntries(
      modules.map((module) => [
        `${SIM_WORLD_DIRNAME}/${module.path}${SIM_MODULE_FILE_SUFFIX}`,
        formatSimModuleFile(module),
      ])
    ),
  };

  const { push: _machine, ...rest } = push;
  return {
    ...rest,
    files,
    bundles: {},
    api: push.api.filter((call) => !PUSH_ROAD_ONLY_CALLS.has(call.call)),
  };
}

const ESCAPE_CODES = /\u001b\[[0-9;]*m/g;

/** A line of the platform's own rows: `🤖 Android  Bundling the JavaScript...`. */
const PUSH_ROAD_OWN_LINE = /^(🤖 Android|🍏 iOS) /;
/** The sim road's header and upload lines: `🧪 Sim mode: ...`, `⬆️  Uploading android sim world...`. */
const SIM_ROAD_OWN_LINE = /🧪 Sim mode: |sim world \+ manifest/;

/**
 * The screen with the road's own lines taken out. Above the test's row the blank lines go too:
 * they only space the road's own lines from the rest.
 */
function withoutOwnLines(screen: string, ownLine: RegExp): string[] {
  const lines = screen.split('\n');
  const testRow = lines.findIndex((line) => /^Test \d+ /.test(line));
  return lines.filter((line, index) => {
    const bare = line.replace(ESCAPE_CODES, '');
    if (ownLine.test(bare)) return false;
    return index >= testRow || bare.trim() !== '';
  });
}

describe('the sim road prints what the push road prints', () => {
  it("the sim road prints the push road's lines apart from its own bundling and upload lines", async () => {
    for (const name of PUSH_POSES) {
      const push = inPathOrder(catalogPushPose(name));
      const pushed = await runPose(push);
      const simulated = await runPose(asSimWorld(push));

      expect(pushed.refusals, name).toEqual([]);
      expect(simulated.refusals, name).toEqual([]);
      expect(withoutOwnLines(simulated.screen, SIM_ROAD_OWN_LINE), name).toEqual(
        withoutOwnLines(pushed.screen, PUSH_ROAD_OWN_LINE)
      );
      expect(simulated.exitCode, name).toBe(pushed.exitCode);
    }
  });
});
