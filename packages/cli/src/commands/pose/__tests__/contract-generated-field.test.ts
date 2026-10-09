/**
 * THE POSE CONTRACT IS GENERATED FROM THE SEAMS (sherlo / Drawing for a plan).
 *
 * One case of the generated-contract check, kept in a file of its own: it builds a TypeScript
 * program of its own and starts a process, so beside the others it took the whole file past its
 * time limit. See `contract-generated.test.ts` for the rest, and for why the contract and the
 * shape reader in `readPose.ts` are generated from the seams' own types.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { validPose } from './support/validPose';

const CLI_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const GENERATED_READER = path.join(CLI_ROOT, 'src', 'commands', 'pose', 'readPose.generated.ts');
const SERVER_SEAM = path.join(CLI_ROOT, 'src', 'seams', 'serverCalls.ts');

/**
 * The generator `yarn generate:pose-contract` runs, called in this process. Imported by a path
 * held in a variable, because the script sits outside the CLI's `src`, where the CLI's own type
 * check never reaches.
 */
type PoseContractGenerator = {
  generatePoseContract(seamSources?: Record<string, string>): { contract: string; reader: string };
};
const GENERATOR_SCRIPT = path.join(CLI_ROOT, 'scripts', 'generate-pose-contract.ts');

/** A case that builds a TypeScript program of its own and starts a process: seconds, not milliseconds. */
const A_GENERATION = 60_000;

/**
 * Read each pose through the reader AS IT IS ON DISK, all in one process of its own, and say for
 * each whether it was accepted and, if not, what the refusal said.
 *
 * A case that regenerates the reader cannot read its work through this file's own import: the
 * test runner loaded that module before the generator ran, and re-importing it hands back what
 * was loaded. A fresh process has no such memory.
 */
function readPoses(
  documents: unknown[],
  generatedReaderUnderTest: string
): Array<{ ok: boolean; said: string }> {
  // The fresh process loads the reader under test wherever `readPose.ts` asks for the committed
  // one, so no other file running alongside ever sees a reader that is not the committed one.
  const load =
    'const Module = require("module");' +
    'const resolveFilename = Module._resolveFilename;' +
    'Module._resolveFilename = function (request, ...rest) {' +
    '  const resolved = resolveFilename.call(this, request, ...rest);' +
    '  return resolved.endsWith("readPose.generated.ts") ? process.env.GENERATED_READER_UNDER_TEST : resolved;' +
    '};' +
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
    env: {
      ...process.env,
      POSES: JSON.stringify(documents),
      GENERATED_READER_UNDER_TEST: generatedReaderUnderTest,
    },
  });
  return JSON.parse(printed);
}

describe('the pose contract and its reader are generated from the seam types', () => {
  it(
    'a field added to a seam answer type appears in the contract and is accepted by the reader after one generation',
    async () => {
      const generator: PoseContractGenerator = await import(GENERATOR_SCRIPT);

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

      // A sibling only this run uses, so its relative imports resolve as the real one's do.
      const readerUnderTest = path.join(
        path.dirname(GENERATED_READER),
        `readPose.generated.field-test-${process.pid}.ts`
      );
      try {
        fs.writeFileSync(readerUnderTest, generated.reader);
        const [stated, invented] = readPoses(
          [
            gatePose({ outcome: 'fast', diff: [], measuredAt: '2026-09-15' }),
            gatePose({ outcome: 'fast', diff: [], measuredBy: 'nobody' }),
          ],
          readerUnderTest
        );

        // And the reader generated from it ACCEPTS a pose that states the field.
        expect(stated.ok).toBe(true);

        // CONTROL: the field is accepted because it was GENERATED, not because unknown keys pass.
        expect(invented.ok).toBe(false);
        expect(invented.said).toContain('measuredBy: unknown field');
      } finally {
        fs.rmSync(readerUnderTest, { force: true });
      }
    },
    A_GENERATION
  );
});
