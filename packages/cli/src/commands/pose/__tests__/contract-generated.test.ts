/**
 * THE POSE CONTRACT IS GENERATED FROM THE SEAMS (sherlo / Drawing for a plan).
 *
 * `contracts/pose.contract.ts` and the shape reader in `readPose.ts` used to be written by hand,
 * so a field added to a seam's answer was written three times and drifted the first time somebody
 * forgot one. Both are generated from the seams' own types now, and a hand edit to either fails
 * this check. Written as a skeleton in plan (epic pose-road-hardening, task
 * pose-road-contract-generated); the worker fills the bodies and never renames a case.
 */
import fs from 'fs';
import path from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import { PoseRefusal, readPose } from '../readPose';
import { validPose } from './support/validPose';

const CLI_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const REPO_ROOT = path.resolve(CLI_ROOT, '..', '..');
const CONTRACT = path.join(REPO_ROOT, 'contracts', 'pose.contract.ts');
const GENERATED_READER = path.join(CLI_ROOT, 'src', 'commands', 'pose', 'readPose.generated.ts');

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

let generator: PoseContractGenerator;
/** What the seam types on disk generate - made once, for every case that asks. */
let generatedFromTheSeams: { contract: string; reader: string };

beforeAll(async () => {
  generator = await import(GENERATOR_SCRIPT);
  generatedFromTheSeams = generator.generatePoseContract();
}, 60_000);

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
