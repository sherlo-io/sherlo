/**
 * THE POSE CONTRACT IS GENERATED FROM THE SEAMS (sherlo / Drawing for a plan).
 *
 * `contracts/pose.contract.ts` and the shape reader in `readPose.ts` used to be written by hand,
 * so a field added to a seam's answer was written three times and drifted the first time somebody
 * forgot one. Both are generated from the seams' own types now, and a hand edit to either fails
 * this check. Written as a skeleton in plan (epic pose-road-hardening, task
 * pose-road-contract-generated); the worker fills the bodies and never renames a case.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { PoseRefusal, readPose } from '../readPose';

const CLI_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const REPO_ROOT = path.resolve(CLI_ROOT, '..', '..');
const CONTRACT = path.join(REPO_ROOT, 'contracts', 'pose.contract.ts');
const GENERATED_READER = path.join(CLI_ROOT, 'src', 'commands', 'pose', 'readPose.generated.ts');
const SERVER_SEAM = path.join(CLI_ROOT, 'src', 'seams', 'serverCalls.ts');

/** Building a TypeScript program over the whole CLI takes seconds, and every case here needs one. */
const A_GENERATION = 120_000;

/** A pose with nothing wrong with it - the thing the cases below break in one way at a time. */
function validPose(): Record<string, unknown> {
  return {
    pose: 1,
    argv: ['view', '7'],
    files: {},
    env: {},
    git: 'none',
    bundles: {},
    api: [{ call: 'getBuildStatus', with: { buildIndex: 7 }, answer: { runStatus: 'finished' } }],
    masks: {},
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

/** Run one of the package's own pose-contract scripts, and say whether it was happy. */
function runScript(script: 'generate:pose-contract' | 'check:pose-contract'): {
  ok: boolean;
  said: string;
} {
  try {
    const said = execFileSync('yarn', [script], { cwd: CLI_ROOT, encoding: 'utf8', stdio: 'pipe' });
    return { ok: true, said };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return { ok: false, said: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
  }
}

/**
 * Read a pose through the reader AS IT IS ON DISK, in a process of its own.
 *
 * A case that regenerates the reader cannot read its work through this file's own import: the
 * test runner loaded that module before the generator ran, and re-importing it hands back what
 * was loaded. A fresh process has no such memory.
 */
function readsPose(document: unknown): { ok: boolean; said: string } {
  const load =
    'const { readPose } = require("./src/commands/pose/readPose");' +
    'readPose(JSON.parse(process.env.A_POSE));';

  try {
    execFileSync('yarn', ['run', '-T', 'ts-node', '--transpile-only', '-e', load], {
      cwd: CLI_ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, A_POSE: JSON.stringify(document) },
    });
    return { ok: true, said: '' };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return { ok: false, said: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
  }
}

afterAll(() => {
  // Two cases below write over the generated files on purpose. Whatever happened, the worktree
  // ends holding what the seam types say it should.
  runScript('generate:pose-contract');
});

describe('the pose contract and its reader are generated from the seam types', () => {
  it(
    'the pose contract and its reader are generated from the seam types, and a hand edit to either fails the check',
    () => {
      expect(runScript('check:pose-contract').ok).toBe(true);

      const handEdit = (before: string) => `${before}\n// somebody typed this in by hand\n`;
      const contract = fs.readFileSync(CONTRACT, 'utf8');
      const reader = fs.readFileSync(GENERATED_READER, 'utf8');

      try {
        fs.writeFileSync(CONTRACT, handEdit(contract));
        fs.writeFileSync(GENERATED_READER, handEdit(reader));

        const refused = runScript('check:pose-contract');

        // BY NAME, both of them: a check that only said "something is out of date" would leave
        // whoever reads the red hunting for which file they typed in.
        expect(refused.ok).toBe(false);
        expect(refused.said).toContain('contracts/pose.contract.ts');
        expect(refused.said).toContain('src/commands/pose/readPose.generated.ts');
      } finally {
        fs.writeFileSync(CONTRACT, contract);
        fs.writeFileSync(GENERATED_READER, reader);
      }
    },
    A_GENERATION
  );

  it('the generated contract carries no import, so a consumer can copy it verbatim', () => {
    const contract = fs.readFileSync(CONTRACT, 'utf8');

    // A consumer copies this file into a repository that cannot resolve anything this one
    // declares, so an import would make the copy unresolvable the moment it landed.
    expect(contract).not.toMatch(/^\s*import\s/m);
    expect(contract).not.toMatch(/\brequire\s*\(/);

    // And it says what it is on its first line, so nobody edits it believing it was typed.
    expect(contract.split('\n')[0]).toContain('GENERATED');
    expect(contract.split('\n')[0]).toContain('yarn generate:pose-contract');
  });

  it(
    'a field added to a seam answer type appears in the contract and is accepted by the reader after one generation',
    () => {
      const addAFieldToTheGate = (before: string) =>
        before.replace(
          "  outcome: 'fast' | 'full-build-needed' | 'not-stageable';",
          "  outcome: 'fast' | 'full-build-needed' | 'not-stageable';\n" +
            '  /** A field added by this test, and by nothing else. */\n' +
            '  measuredAt?: string;'
        );

      /** A pose of the one call whose answer the field was added to. */
      const gatePose = (answer: Record<string, unknown>) => ({
        ...validPose(),
        argv: ['test', '--android', 'builds/app.apk'],
        api: [
          {
            call: 'checkStagedGate',
            with: { platform: 'android', baseFingerprint: 'b4c9e2f7' },
            answer,
          },
        ],
      });

      const seamBeforeTheField = fs.readFileSync(SERVER_SEAM, 'utf8');

      try {
        fs.writeFileSync(SERVER_SEAM, addAFieldToTheGate(seamBeforeTheField));
        expect(runScript('generate:pose-contract').ok).toBe(true);

        // ONE edit, in the seam that answers the call - and both copies now carry the field.
        expect(fs.readFileSync(CONTRACT, 'utf8')).toContain('measuredAt?: string;');
        expect(fs.readFileSync(GENERATED_READER, 'utf8')).toContain("'measuredAt'");

        // And the reader generated from it ACCEPTS a pose that states the field.
        expect(
          readsPose(gatePose({ outcome: 'fast', diff: [], measuredAt: '2026-09-15' })).ok
        ).toBe(true);

        // CONTROL: the field is accepted because it was GENERATED, not because unknown keys pass.
        const invented = readsPose(gatePose({ outcome: 'fast', diff: [], measuredBy: 'nobody' }));
        expect(invented.ok).toBe(false);
        expect(invented.said).toContain('measuredBy: unknown field');
      } finally {
        fs.writeFileSync(SERVER_SEAM, seamBeforeTheField);
      }
    },
    A_GENERATION
  );

  it('the reader still refuses a missing field, an unknown key and a wrong type, naming every problem in one message', () => {
    const broken = validPose();
    delete broken.masks; // missing
    broken.env = { SKIP_INTRO: 7 }; // wrong type, one level down
    (broken as Record<string, unknown>).ambient = {}; // unknown key

    const problems = problemsOf(broken);

    expect(problems).toHaveLength(3);
    expect(problems.join('\n')).toContain('`masks`: expected an object');
    expect(problems.join('\n')).toContain('`env["SKIP_INTRO"]`: expected a string');
    expect(problems.join('\n')).toContain('`ambient`: unknown field');

    // All three in the ONE message a person reads - generating the walk changed nothing about
    // the refusal being a single pass.
    try {
      readPose(broken);
    } catch (error) {
      for (const problem of problems) expect((error as Error).message).toContain(problem);
    }
  });

  it('the meaning checks the generator cannot derive - which commands bundle, which act on the machine - stay hand-written beside the generated reader', () => {
    const aBundleAView: Record<string, unknown> = {
      bundlePath: 'bundle.android.js',
      bundleSizeMb: 4.29,
      bundleFormat: 'plain-js',
      bundler: 'expo',
      assets: [],
      storyClosureKeys: [],
    };

    // Both of these are the RIGHT SHAPE and the wrong meaning: a type cannot say that `view`
    // never bundles or that only `init` installs a package. So each is refused with exactly one
    // problem - the generated half found nothing to say about either.
    const bundlesOnAView = problemsOf({ ...validPose(), bundles: { android: aBundleAView } });
    expect(bundlesOnAView).toHaveLength(1);
    expect(bundlesOnAView[0]).toContain('never reaches a bundler');

    const workstationOnAView = problemsOf({
      ...validPose(),
      workstation: {
        install: { package: '@sherlo/react-native-storybook@2.0.2' },
        enter: 'pressed',
      },
    });
    expect(workstationOnAView).toHaveLength(1);
    expect(workstationOnAView[0]).toContain('never installs a package');

    // And those sentences live in the hand-written half, where a person can change them.
    expect(fs.readFileSync(GENERATED_READER, 'utf8')).not.toContain('never reaches a bundler');
    expect(fs.readFileSync(path.join(__dirname, '..', 'readPose.ts'), 'utf8')).toContain(
      'never reaches a bundler'
    );
  });
});
