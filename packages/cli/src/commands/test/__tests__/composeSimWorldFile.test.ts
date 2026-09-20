/**
 * Tests for the seam with the executor (./composeSimWorldFile): the tree the
 * CLI reads folded into the one document the API's `parseSimWorld` accepts.
 *
 * The world used to be one file parsed independently by BOTH sides, and the two
 * schemas had drifted: a world spelled the way the CLI's own type documented it
 * passed `sherlo test` and then killed the build inside the executor. With the
 * tree CLI-only and this document API-only there is one producer and one
 * consumer, so the drift has nowhere to live - but only if what this producer
 * emits really is what that consumer accepts, which is what the first block
 * below asserts, rule by rule.
 */
import { describe, expect, it } from 'vitest';
import composeSimWorldFile from '../composeSimWorldFile';
import type { SimModule, SimWorld } from '../simWorld';

// ---------------------------------------------------------------------------
// A COPY OF THE API'S WORLD SCHEMA, asserted against below. Source: sherlo-api
// endpoints/simExecutorEndpoint/parseSimWorld.ts. If that parser ever moves,
// this copy - and the composition it judges - must move with it.
// ---------------------------------------------------------------------------

const API_RUN_OUTCOMES = ['crash-on-launch', 'ok', 'system-error'];
const API_HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const API_SIM_WORLD_VERSION = 1;

/** Every refusal `parseSimWorld` can make, in its own order. */
function apiRefusals(json: string): string[] {
  const refusals: string[] = [];

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json);
  } catch {
    return ['notJson'];
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return ['worldIsNotAnObject'];
  }
  if (parsed.simVersion !== API_SIM_WORLD_VERSION) refusals.push('unsupportedSimVersion');

  const modules = parsed.modules;
  if (typeof modules !== 'object' || modules === null || Array.isArray(modules)) {
    refusals.push('modulesIsNotAnObject');
  } else {
    for (const [path, content] of Object.entries(modules)) {
      if (typeof content !== 'string') refusals.push(`moduleContentIsNotAString:${path}`);
    }
  }

  const stories = parsed.stories;
  if (!Array.isArray(stories)) return [...refusals, 'storiesIsNotAnArray'];
  if (stories.length === 0) refusals.push('storiesIsEmpty');

  const ids: string[] = [];
  for (const story of stories as Record<string, unknown>[]) {
    if (typeof story.id !== 'string' || story.id === '') {
      refusals.push('storyIdIsNotANonEmptyString');
    } else ids.push(story.id);

    if (typeof story.file !== 'string' || story.file === '') {
      refusals.push(`storyFileIsNotANonEmptyString:${String(story.id)}`);
    }

    const name = story.name ?? story.id;
    if (typeof name !== 'string' || name === '') refusals.push('storyNameIsNotANonEmptyString');
    if (story.title !== undefined && (typeof story.title !== 'string' || story.title === '')) {
      refusals.push('storyTitleIsNotANonEmptyString');
    }

    const render = story.render as Record<string, unknown> | undefined;
    if (typeof render !== 'object' || render === null || Array.isArray(render)) {
      refusals.push(`storyRenderIsNotAnObject:${String(story.id)}`);
    } else {
      if (typeof render.text !== 'string') refusals.push('storyRenderTextIsNotAString');
      if (typeof render.bg !== 'string' || !API_HEX_COLOR.test(render.bg)) {
        refusals.push('storyRenderBgIsNotAHexColor');
      }
    }

    if (story.imports !== undefined) {
      if (!Array.isArray(story.imports) || story.imports.some((path) => typeof path !== 'string')) {
        refusals.push('storyImportsIsNotAStringArray');
      }
    }
  }

  if (new Set(ids).size !== ids.length) refusals.push('storyIdsAreNotUnique');

  const run = parsed.run as Record<string, unknown> | undefined;
  if (run !== undefined) {
    if (typeof run !== 'object' || run === null || Array.isArray(run)) {
      refusals.push('runIsNotAnObject');
    } else {
      const outcome = run.outcome ?? 'ok';
      if (typeof outcome !== 'string' || !API_RUN_OUTCOMES.includes(outcome)) {
        refusals.push('unknownRunOutcome');
      }
      const storyErrors = run.storyErrors ?? [];
      if (!Array.isArray(storyErrors) || storyErrors.some((id) => typeof id !== 'string')) {
        refusals.push('runStoryErrorsIsNotAStringArray');
      } else {
        for (const id of storyErrors as string[]) {
          if (!ids.includes(id)) refusals.push(`runStoryErrorNamesAnUndeclaredStory:${id}`);
        }
      }
    }
  }

  return refusals;
}

/** The name the API composes for a story - title, a spaced hyphen, name. */
function apiDisplayName(story: { id: string; title?: string; name?: string }): string {
  const name = story.name ?? story.id;
  return story.title !== undefined ? `${story.title} - ${name}` : name;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BUTTON = 'src/components/SharedButton.tsx';
const STORY_FILE = 'src/stories/SharedButton.stories.tsx';

function world(modules: SimModule[], outcome: SimWorld['run']['outcome'] = 'ok'): SimWorld {
  return { simVersion: 1, modules, run: { outcome } };
}

function baseModules(): SimModule[] {
  return [
    { path: BUTTON, content: 'SharedButton v1', imports: [], stories: [] },
    {
      path: STORY_FILE,
      content: 'story shell',
      imports: [BUTTON],
      stories: [
        {
          id: 'sharedbutton--primary',
          title: 'Storefront/SharedButton',
          name: 'Primary',
          render: { text: 'Add to Cart', bg: '#0066cc' },
        },
      ],
    },
  ];
}

function composed(simWorld: SimWorld): Record<string, any> {
  return JSON.parse(composeSimWorldFile(simWorld).toString('utf8'));
}

// ---------------------------------------------------------------------------

describe('what the executor receives', () => {
  it('passes the API schema, rule for rule', () => {
    expect(apiRefusals(composeSimWorldFile(world(baseModules())).toString('utf8'))).toEqual([]);
  });

  it('passes it for every run outcome, and with a story error declared', () => {
    for (const outcome of ['ok', 'crash-on-launch', 'system-error'] as const) {
      expect(
        apiRefusals(composeSimWorldFile(world(baseModules(), outcome)).toString('utf8'))
      ).toEqual([]);
    }

    const broken = baseModules();
    broken[1].stories[0].error = true;
    expect(apiRefusals(composeSimWorldFile(world(broken)).toString('utf8'))).toEqual([]);
  });

  it('flattens the tree into modules and stories, each story naming its file', () => {
    const contents = composed(world(baseModules()));

    expect(contents.modules).toEqual({
      [BUTTON]: 'SharedButton v1',
      [STORY_FILE]: 'story shell',
    });
    expect(contents.stories).toEqual([
      {
        id: 'sharedbutton--primary',
        file: STORY_FILE,
        title: 'Storefront/SharedButton',
        name: 'Primary',
        render: { text: 'Add to Cart', bg: '#0066cc' },
      },
    ]);
  });

  // On the tree side an error sits on the story, so a branch declaring one
  // touches only that story's file. The executor knows only the run-level list.
  it("turns a story's error flag into the run.storyErrors the executor reads", () => {
    const broken = baseModules();
    broken[1].stories[0].error = true;

    expect(composed(world(broken)).run).toEqual({
      outcome: 'ok',
      storyErrors: ['sharedbutton--primary'],
    });
    expect(composed(world(baseModules())).run).toEqual({ outcome: 'ok', storyErrors: [] });
    // `error` is the tree's spelling and must not leak onto the wire.
    expect(composed(world(broken)).stories[0].error).toBeUndefined();
  });

  it('lets the API compose the display name the product shows', () => {
    const story = composed(world(baseModules())).stories[0];

    expect(apiDisplayName(story)).toBe('Storefront/SharedButton - Primary');
  });

  it('omits an absent title and name rather than inventing them', () => {
    const bare = baseModules();
    delete bare[1].stories[0].title;
    delete bare[1].stories[0].name;

    const story = composed(world(bare)).stories[0];
    expect(story.title).toBeUndefined();
    expect(story.name).toBeUndefined();
    expect(apiDisplayName(story)).toBe('sharedbutton--primary');
  });

  // The executor never reads them, and the closure they feed is the CLI's to
  // compute - so an import edge is not a thing the wire needs an opinion on.
  it('leaves the module import edges behind', () => {
    expect(composed(world(baseModules())).stories[0].imports).toBeUndefined();
  });
});

describe('determinism', () => {
  it('composes byte-identical bytes however the tree was walked', () => {
    const forwards = composeSimWorldFile(world(baseModules()));
    const backwards = composeSimWorldFile(world(baseModules().reverse()));

    expect(forwards.equals(backwards)).toBe(true);
  });
});
