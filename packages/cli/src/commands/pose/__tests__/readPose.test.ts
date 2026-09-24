/**
 * THE POSE READER (sherlo / Drawing for a plan).
 *
 * A pose is written by hand, so the reader's job is not only to refuse a bad one - it is to
 * refuse it ONCE, naming everything wrong with it, so the person fixing it makes one pass rather
 * than one pass per mistake. Every case below is about that: what counts as a problem, and that
 * all of them arrive together.
 */
import { describe, expect, it } from 'vitest';
import { PoseRefusal, readPose, readPoseDocument } from '../readPose';
import { posedServerCalls } from '../../../seams/serverCalls';

/** A pose with nothing wrong with it - the thing every case below breaks in exactly one way. */
function validPose(): Record<string, unknown> {
  return {
    pose: 1,
    argv: ['view', '7'],
    files: { 'sherlo.config.json': { devices: [] } },
    env: { SKIP_INTRO: 'true' },
    git: { branch: 'main', commit: '4f3a9c1d', dirty: false },
    bundles: {},
    api: [{ call: 'getBuildStatus', with: { buildIndex: 7 }, answer: { runStatus: 'finished' } }],
    masks: {},
  };
}

/** What a real push of one Android preview build read off the machine - the `push` a valid pose states. */
function pushOfOneAndroidBuild() {
  return {
    now: '2026-09-15T12:00:00.000Z',
    binaries: {
      android: {
        hash: '3f7c1a9e',
        sizeMb: '48.12',
        sdkVersion: '2.0.2',
        hasEmbeddedBundle: true,
        bundleFormat: 'plain-js',
        expoUpdatesEnabled: false,
        hasExpoDevClient: false,
        androidAbis: ['arm64-v8a'],
      },
    },
    fingerprint: { hash: 'b4c9e2f7' },
  };
}

/** The problems a document is refused with, or a failure saying it was accepted. */
function problemsOf(document: unknown): string[] {
  try {
    readPose(document);
  } catch (error) {
    if (error instanceof PoseRefusal) return error.problems;
    throw error;
  }

  throw new Error('the reader ACCEPTED this document - the case below is proving nothing');
}

describe('reading a CommandPose', () => {
  it('reads a pose with nothing wrong with it', () => {
    expect(readPose(validPose())).toMatchObject({ pose: 1, argv: ['view', '7'] });
  });

  it('a pose with a missing field, an unknown key or a value of the wrong type is refused naming every problem at once', () => {
    const broken = validPose();
    delete broken.git; // missing
    broken.env = { SKIP_INTRO: true }; // wrong type, one level down
    broken.argv = 'view 7'; // wrong type
    (broken as Record<string, unknown>).ambient = { skipIntro: true }; // unknown key

    const problems = problemsOf(broken);

    // ALL FOUR, in ONE refusal. A reader that stopped at the first would make fixing a
    // hand-written pose one round trip per mistake.
    expect(problems).toHaveLength(4);
    expect(problems.join('\n')).toContain('`argv`');
    expect(problems.join('\n')).toContain('`env["SKIP_INTRO"]`');
    expect(problems.join('\n')).toContain('`git`');
    expect(problems.join('\n')).toContain('`ambient`: unknown field');

    // And the one message a person reads carries every one of them.
    try {
      readPose(broken);
    } catch (error) {
      for (const problem of problems) expect((error as Error).message).toContain(problem);
    }
  });

  it('names an unknown field BY NAME rather than ignoring it', () => {
    const withExtra = { ...validPose(), transcript: 'a name that was never a field' };

    expect(problemsOf(withExtra)).toEqual(['`transcript`: unknown field']);
  });

  it('refuses a version it does not know', () => {
    expect(problemsOf({ ...validPose(), pose: 2 }).join()).toContain('knows version 1');
  });

  it('refuses a `git` that is neither the two words nor the three facts', () => {
    expect(problemsOf({ ...validPose(), git: 'missing' }).join()).toContain('`git`');
    expect(problemsOf({ ...validPose(), git: { branch: 'main', commit: 'abc' } }).join()).toContain(
      '`git`.dirty'
    );
  });

  it('accepts the two words a failed git read is stated with', () => {
    expect(readPose({ ...validPose(), git: 'none' }).git).toBe('none');
    expect(readPose({ ...validPose(), git: 'unavailable' }).git).toBe('unavailable');
  });

  it('refuses bundles supplied to a command that never reaches a bundler', () => {
    const bundlesOnAView = {
      ...validPose(),
      bundles: {
        android: {
          bundlePath: 'bundle.android.js',
          bundleSizeMb: 4.29,
          bundleFormat: 'plain-js',
          bundler: 'expo',
          assets: [],
          storyClosureKeys: [],
        },
      },
    };

    expect(problemsOf(bundlesOnAView).join()).toContain('never reaches a bundler');
  });

  it('accepts the same bundles on the command that does bundle', () => {
    const bundlesOnATest = {
      ...validPose(),
      argv: ['test', '--dry-run'],
      api: [],
      bundles: {
        android: {
          bundlePath: 'bundle.android.js',
          bundleSizeMb: 4.29,
          bundleFormat: 'plain-js',
          bundler: 'expo',
          assets: [],
          storyClosureKeys: [],
        },
      },
    };

    expect(Object.keys(readPose(bundlesOnATest).bundles)).toEqual(['android']);
  });

  it('refuses an operation the contract does not name, and says which it does', () => {
    // `checkStagedGate` used to stand in for an operation the contract had not yet named; the
    // contract has named it since, so a genuinely unknown one takes its place here.
    const unknownCall = {
      ...validPose(),
      api: [{ call: 'deleteEverything', with: {}, answer: {} }],
    };

    const said = problemsOf(unknownCall).join();
    expect(said).toContain('deleteEverything');
    expect(said).toContain('`getBuildStatus`');
  });

  it('refuses an answer whose shape the backend could not send', () => {
    const impossible = {
      ...validPose(),
      api: [{ call: 'getBuildStatus', with: { buildIndex: 7 }, answer: { runStatus: 'done' } }],
    };

    expect(problemsOf(impossible).join()).toContain('runStatus');
  });

  it('accepts the error the server sends, for any call', () => {
    const serverRefused = {
      ...validPose(),
      api: [{ call: 'getBuildStatus', with: { buildIndex: 7 }, answer: { error: 'HTTP 403' } }],
    };

    expect(readPose(serverRefused).api).toHaveLength(1);
  });

  it('accepts `null` only where the wire can send it', () => {
    const buildIsNotThere = {
      ...validPose(),
      api: [{ call: 'getBuildStatus', with: { buildIndex: 99 }, answer: null }],
    };
    expect(readPose(buildIsNotThere).api).toHaveLength(1);

    const teamIsNotThere = {
      ...validPose(),
      argv: ['team', 'list'],
      api: [{ call: 'listTeams', with: {}, answer: null }],
    };
    expect(problemsOf(teamIsNotThere).join()).toContain('only `getBuildStatus` answers `null`');
  });

  it('refuses a `push` stated for a command that never reads a native build', () => {
    const viewWithAPush = { ...validPose(), push: pushOfOneAndroidBuild() };

    expect(problemsOf(viewWithAPush).join()).toContain('never reads a native build');
  });

  it('accepts a `push` on the command that does, and refuses one that says a binary wrong', () => {
    const push = {
      ...validPose(),
      argv: ['test', '--android', 'builds/app.apk'],
      api: [],
      push: pushOfOneAndroidBuild(),
    };
    expect(readPose(push).push?.binaries.android?.sizeMb).toBe('48.12');

    const wrong = {
      ...push,
      push: {
        now: 'yesterday afternoon',
        binaries: {
          android: { ...pushOfOneAndroidBuild().binaries.android, bundleFormat: 'zip', abis: [] },
        },
        fingerprint: { hash: 'a1', unavailable: 'no' },
      },
    };
    const problems = problemsOf(wrong);
    expect(problems.join('\n')).toContain('`push`.now: expected an ISO 8601 instant');
    expect(problems.join('\n')).toContain('bundleFormat: expected one of');
    expect(problems.join('\n')).toContain('abis: unknown field');
    expect(problems.join('\n')).toContain('`push.fingerprint`.unavailable: unknown field');
  });

  it("reads a push's two server answers, and refuses a binary decision that is neither an upload nor a reuse", () => {
    const scripted = {
      ...validPose(),
      argv: ['test', '--android', 'builds/app.apk'],
      api: [
        {
          call: 'getNextBuildInfo',
          with: { platforms: ['android'] },
          answer: {
            nextBuildIndex: 2,
            binaries: {
              android: { reuse: { buildIndex: 1, createdAt: '2026-09-15T11:53:00.000Z' } },
            },
          },
        },
        { call: 'getStagedUploadUrls', with: { platforms: ['android'] }, answer: {} },
      ],
      push: pushOfOneAndroidBuild(),
    };
    expect(readPose(scripted).api).toHaveLength(2);

    const undecided = {
      ...scripted,
      api: [
        {
          call: 'getNextBuildInfo',
          with: { platforms: ['android'] },
          answer: { nextBuildIndex: 2, binaries: { android: {} } },
        },
      ],
    };
    expect(problemsOf(undecided).join()).toContain('expected `{ upload: true }` or `{ reuse:');
  });

  it("accepts an openBuild answer's capture decision, and refuses one with a bad platform, field or type", () => {
    const openBuildPose = (captureDecision: unknown) => ({
      ...validPose(),
      argv: ['test', '--wait'],
      api: [
        {
          call: 'openBuild',
          with: { platforms: ['android'] },
          answer: { buildIndex: 2, url: 'https://app.sherlo.io/build?b=2', captureDecision },
        },
      ],
    });

    expect(
      readPose(
        openBuildPose({
          platforms: { android: { full: false, storyFilePaths: ['a.stories.tsx'], reason: 'x' } },
          fullCaptureTriggerReason: 'y',
          ancestorBuildIndex: 1,
        })
      ).api
    ).toHaveLength(1);

    const problems = problemsOf(
      openBuildPose({
        platforms: { windows: { full: 'yes' }, android: { full: true, extra: true } },
      })
    );

    expect(problems.join('\n')).toContain('`windows` is not a platform');
    expect(problems.join('\n')).toContain('.full: expected true or false');
    expect(problems.join('\n')).toContain('extra: unknown field');
  });

  it('a story row may state a null reason and null candidates, because the wire sends them', () => {
    const pose = {
      ...validPose(),
      api: [
        {
          call: 'getBuildStatus',
          with: { buildIndex: 7 },
          answer: {
            runStatus: 'finished',
            stories: [
              { name: 'Storefront/ProductCard', status: 'unreviewed', baseline: null },
              {
                name: 'Storefront/Checkout',
                status: 'noChanges',
                baseline: { buildIndex: 6 },
                reason: null,
                candidates: null,
              },
            ],
          },
        },
      ],
    };

    expect(readPose(pose).api).toHaveLength(1);
  });

  it('a document that is not JSON is refused the same way as one that is the wrong shape', () => {
    expect(() => readPoseDocument('{ not json')).toThrow(PoseRefusal);
    expect(() => readPoseDocument('{ not json')).toThrow('not valid JSON');
  });

  it('reads what the app answered for a capture: the stories, the crash, and the facts beside the tree', () => {
    const captured = {
      ...validPose(),
      argv: ['capture', '--story', 'controls-button--primary'],
      capture: {
        stories: ['controls-button--primary'],
        settled: { ms: 1400, frames: 6 },
        parts: 3,
        hasNetworkImage: true,
        tree: { primitive: 'ScrollView', components: ['Feed'], children: [] },
      },
    };
    const died = {
      ...validPose(),
      argv: ['capture', '--story', 'controls-button--primary'],
      capture: { stories: ['controls-button--primary'], crashed: { name: 'RangeError' } },
    };
    const said = {
      ...validPose(),
      argv: ['capture', '--story', 'controls-button--primary'],
      capture: { stories: ['controls-button--primary'], crashed: {} },
    };

    expect(readPose(captured).capture).toMatchObject({ parts: 3, hasNetworkImage: true });
    // A crash is stated with what the app said before it died, and the app may have said nothing.
    expect(readPose(died).capture).toMatchObject({ crashed: { name: 'RangeError' } });
    expect(readPose(said).capture).toMatchObject({ crashed: {} });
  });

  it('refuses a capture that describes a road the command never walks, or a spelling the app never sends', () => {
    const notACapture = {
      ...validPose(),
      capture: { stories: [], settled: 'timed-out', tree: { primitive: 'View' } },
    };
    const unknownFact = {
      ...validPose(),
      argv: ['capture', '--story', 'controls-button--primary'],
      capture: {
        stories: ['controls-button--primary'],
        settled: { ms: 1400, frames: 6 },
        // The name the letterbox's answer uses, on the capture's answer: a pole that would be read
        // past and printed as nothing, which is what the reader exists to catch.
        showing: 'controls-button--primary',
        tree: { primitive: 'View' },
      },
    };
    const crashNotAnObject = {
      ...validPose(),
      argv: ['capture', '--story', 'controls-button--primary'],
      capture: { stories: ['controls-button--primary'], crashed: 'yes' },
    };

    expect(problemsOf(notACapture).join('\n')).toContain('never asks the app for a capture');
    expect(problemsOf(unknownFact).join('\n')).toContain('`capture`.showing: unknown field');
    expect(problemsOf(crashNotAnObject).join('\n')).toContain('`capture`.crashed');
  });

  it("refuses a view's size that is missing a side, and a props value that is neither a string, a number nor true/false", () => {
    const sizeMissingASide = {
      ...validPose(),
      argv: ['capture', '--story', 'controls-button--primary'],
      capture: {
        stories: ['controls-button--primary'],
        settled: { ms: 1400, frames: 6 },
        tree: { primitive: 'View', size: { width: 100 }, children: [] },
      },
    };
    const propsIsAnObject = {
      ...validPose(),
      argv: ['capture', '--story', 'controls-button--primary'],
      capture: {
        stories: ['controls-button--primary'],
        settled: { ms: 1400, frames: 6 },
        tree: { primitive: 'View', props: { testID: { nested: true } }, children: [] },
      },
    };

    expect(problemsOf(sizeMissingASide).join('\n')).toContain(
      '`capture`.tree.size.height: expected a number'
    );
    expect(problemsOf(propsIsAnObject).join('\n')).toContain(
      '`capture`.tree.props.testID: must be a string, a number or true/false'
    );
  });
});

/**
 * A scripted call's `platforms` argument is matched against what the command asked with AS A
 * SET, not as an array - see the docblock on `firstMismatch` in ../../../seams/serverCalls for
 * why: the tool itself assembles the list in different orders from different call sites, and a
 * pose asserting either order would be asserting an implementation detail while refusing the
 * whole run to do it.
 */
describe("a posed call's platforms are matched against the call as a set", () => {
  it('a posed platform list matches the same platforms in a different order', async () => {
    const api = posedServerCalls([
      { call: 'getStagedUploadUrls', with: { platforms: ['ios', 'android'] }, answer: {} },
    ]);

    await expect(
      api.getStagedUploadUrls({} as never, { platforms: ['android', 'ios'] } as never)
    ).resolves.toBeDefined();
    expect(api.refusals()).toEqual([]);
  });

  it('CONTROL: a posed platform list still refuses a different SET of platforms', async () => {
    const api = posedServerCalls([
      { call: 'getStagedUploadUrls', with: { platforms: ['ios', 'android'] }, answer: {} },
    ]);

    await expect(
      api.getStagedUploadUrls({} as never, { platforms: ['android'] } as never)
    ).rejects.toThrow();

    expect(api.refusals()).toHaveLength(1);
    expect(api.refusals()[0].problem).toContain('`platforms`');
    expect(api.refusals()[0].problem).toContain('"ios"');
    expect(api.refusals()[0].problem).toContain('"android"');
  });

  // `openBuild`'s asked `platforms` is not read off the request - it is composed at the call site
  // from the build config's keys (`serverCalls.ts`'s `openBuild` handler) - so it goes through the
  // same `firstMismatch` as every other call, but is worth its own case: it is the call two real
  // capture runs (35457874350, 35459204774) still refused on AFTER this set-match landed.
  it('openBuild accepts a posed platform list in the other order', async () => {
    const api = posedServerCalls([
      {
        call: 'openBuild',
        with: { platforms: ['ios', 'android'] },
        answer: { buildIndex: 1, url: 'https://app.sherlo.io/build?t=tm000001&p=7&b=1' },
      },
    ]);

    await expect(
      api.openBuild({} as never, { buildRunConfig: { android: {}, ios: {} } } as never)
    ).resolves.toBeDefined();
    expect(api.refusals()).toEqual([]);
  });

  it('CONTROL: openBuild still refuses a different SET of platforms', async () => {
    const api = posedServerCalls([
      {
        call: 'openBuild',
        with: { platforms: ['ios', 'android'] },
        answer: { buildIndex: 1, url: 'https://app.sherlo.io/build?t=tm000001&p=7&b=1' },
      },
    ]);

    await expect(
      api.openBuild({} as never, { buildRunConfig: { android: {} } } as never)
    ).rejects.toThrow();

    expect(api.refusals()).toHaveLength(1);
    expect(api.refusals()[0].problem).toContain('`platforms`');
    expect(api.refusals()[0].problem).toContain('"ios"');
    expect(api.refusals()[0].problem).toContain('"android"');
  });
});
