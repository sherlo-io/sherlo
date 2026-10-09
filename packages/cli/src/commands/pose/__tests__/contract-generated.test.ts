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
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PoseRefusal, readPose } from '../readPose';

const CLI_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const REPO_ROOT = path.resolve(CLI_ROOT, '..', '..');
const CONTRACT = path.join(REPO_ROOT, 'contracts', 'pose.contract.ts');
const GENERATED_READER = path.join(CLI_ROOT, 'src', 'commands', 'pose', 'readPose.generated.ts');
const SERVER_SEAM = path.join(CLI_ROOT, 'src', 'seams', 'serverCalls.ts');

/**
 * The generator `yarn generate:pose-contract` and `yarn check:pose-contract` run, called in this
 * process: building its TypeScript program takes seconds, so this file builds one per seam state
 * it asks about instead of one per script it runs. Imported by a path held in a variable, because
 * the script sits outside the CLI's `src`, where the CLI's own type check never reaches.
 */
type PoseContractGenerator = {
  generatePoseContract(seamSources?: Record<string, string>): { contract: string; reader: string };
  staleFiles(
    generated: { contract: string; reader: string },
    readOnDisk?: (file: string) => string
  ): Array<{ file: string; name: string; fresh: string }>;
};
const GENERATOR_SCRIPT = path.join(CLI_ROOT, 'scripts', 'generate-pose-contract.ts');

/** A case that builds a TypeScript program of its own and starts a process: seconds, not milliseconds. */
const A_GENERATION = 60_000;

let generator: PoseContractGenerator;
/** What the seam types on disk generate - made once, for every case that asks. */
let generatedFromTheSeams: { contract: string; reader: string };

beforeAll(async () => {
  generator = await import(GENERATOR_SCRIPT);
  generatedFromTheSeams = generator.generatePoseContract();
}, 60_000);

afterAll(() => {
  // A case below writes over the generated reader on purpose. Whatever happened to it, the
  // worktree ends holding the reader the seam types generate - the one generation made above,
  // written back, so this net costs no second program.
  if (generatedFromTheSeams) fs.writeFileSync(GENERATED_READER, generatedFromTheSeams.reader);
});

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

/**
 * Read each pose through the reader AS IT IS ON DISK, all in one process of its own, and say for
 * each whether it was accepted and, if not, what the refusal said.
 *
 * A case that regenerates the reader cannot read its work through this file's own import: the
 * test runner loaded that module before the generator ran, and re-importing it hands back what
 * was loaded. A fresh process has no such memory.
 */
function readPoses(documents: unknown[]): Array<{ ok: boolean; said: string }> {
  const load =
    'const { readPose } = require("./src/commands/pose/readPose");' +
    'const said = JSON.parse(process.env.POSES).map((pose) => {' +
    '  try { readPose(pose); return { ok: true, said: "" }; }' +
    '  catch (error) { return { ok: false, said: String(error && error.message) }; }' +
    '});' +
    'process.stdout.write(JSON.stringify(said));';

  const printed = execFileSync('yarn', ['run', '-T', 'ts-node', '--transpile-only', '-e', load], {
    cwd: CLI_ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, POSES: JSON.stringify(documents) },
  });
  return JSON.parse(printed);
}

describe('the pose contract and its reader are generated from the seam types', () => {
  it('the pose contract and its reader are generated from the seam types, and a hand edit to either fails the check', () => {
    // What the check (`yarn check:pose-contract`) holds the committed files against.
    expect(generator.staleFiles(generatedFromTheSeams)).toEqual([]);

    const handEdit = (file: string) =>
      `${fs.readFileSync(file, 'utf8')}\n// somebody typed this in by hand\n`;
    const refused = generator.staleFiles(generatedFromTheSeams, handEdit);

    // BY NAME, both of them: a check that only said "something is out of date" would leave
    // whoever reads the red hunting for which file they typed in.
    const refusedNames = refused.map(({ name }) => name);
    expect(refusedNames).toHaveLength(2);
    expect(refusedNames.join('\n')).toContain('contracts/pose.contract.ts');
    expect(refusedNames.join('\n')).toContain('src/commands/pose/readPose.generated.ts');
  });

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

      const seamWithTheField = addAFieldToTheGate(fs.readFileSync(SERVER_SEAM, 'utf8'));
      const generated = generator.generatePoseContract({ [SERVER_SEAM]: seamWithTheField });

      // ONE edit, in the seam that answers the call - and both copies now carry the field.
      expect(generated.contract).toContain('measuredAt?: string;');
      expect(generated.reader).toContain("'measuredAt'");

      const committedReader = fs.readFileSync(GENERATED_READER, 'utf8');
      try {
        fs.writeFileSync(GENERATED_READER, generated.reader);
        const [stated, invented] = readPoses([
          gatePose({ outcome: 'fast', diff: [], measuredAt: '2026-09-15' }),
          gatePose({ outcome: 'fast', diff: [], measuredBy: 'nobody' }),
        ]);

        // And the reader generated from it ACCEPTS a pose that states the field.
        expect(stated.ok).toBe(true);

        // CONTROL: the field is accepted because it was GENERATED, not because unknown keys pass.
        expect(invented.ok).toBe(false);
        expect(invented.said).toContain('measuredBy: unknown field');
      } finally {
        fs.writeFileSync(GENERATED_READER, committedReader);
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
