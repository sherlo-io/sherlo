/**
 * WHERE THE COMMITTED FIXTURES LIVE, and WHO IS ALLOWED TO PROCEED WITHOUT THEM.
 *
 * Every byte ratchet in this directory (dry-run transcripts, push transcripts,
 * preflight refusals) proves the same claim: the CLI still renders, byte for
 * byte, the fixture a person reviewed into git over in sherlo-tester. Those
 * fixtures - and the masker the capture applies, which the ratchets IMPORT
 * rather than copy so a producer-local second implementation cannot drift - are
 * in a different repository. This module is the one place that answers "is that
 * repository here, and what happens if it is not".
 *
 * ==========================================================================
 * THE TWO ANSWERS, AND WHY THEY DIFFER
 * ==========================================================================
 *
 * A DEVELOPER may skip. Cloning a second private repository is not a
 * precondition for running the CLI's unit suite on a laptop; the shape cases in
 * every ratchet still run, so a local suite with no sherlo-tester is a reduced
 * proof, not a broken one, and it says so out loud.
 *
 * CI MAY NOT SKIP. That distinction is the entire reason this module exists.
 * Until CI supplied the checkout, `TESTER_AVAILABLE` was false on every runner,
 * so every byte case CLASSIFIED AS SKIPPED and the program's central guarantee -
 * an extraction cannot change what a real user sees, because the committed
 * fixtures would red - was enforced on nobody. A contributor refactoring the
 * render layer got a green PR and a changed product. CI now checks sherlo-tester
 * out (see `scripts/checkout-tester.sh`, wired from `pr_checks.yml` and
 * `manual_tests.yml`), and from here on an ABSENT checkout in CI is a FAILURE,
 * not a skip: `mandatoryInCi()` below is a case that reds, and it runs
 * unconditionally so it can never itself be skipped away.
 *
 * The discriminator is `CI`, which GitHub Actions sets on every runner and no
 * ordinary laptop shell sets. It is deliberately NOT some sherlo-specific flag a
 * workflow opts into: a flag that CI must remember to set is a flag a future
 * workflow forgets, and forgetting would restore the exact silence this replaces.
 */
import * as fs from 'fs';
import * as path from 'path';
import { expect, it } from 'vitest';

/**
 * The repository root of THIS checkout - six levels up from
 * `packages/cli/src/commands/test/__tests__`.
 */
const CLI_REPO_ROOT = path.resolve(__dirname, '../../../../../..');

/**
 * The sherlo-tester checkout holding the committed fixtures and the shipped
 * masker.
 *
 * Default: the SIBLING of this repository, which is how the two are cloned side
 * by side locally. `SHERLO_TESTER_ROOT` overrides it, and CI always sets that
 * override rather than relying on the default, because a runner checks the
 * second repository out into the runner temp directory - deliberately OUTSIDE
 * this repository's tree, so 4,700 tester files never reach eslint, tsc or
 * vitest's own file discovery.
 *
 * An EMPTY override counts as no override. A matrix workflow that computes this
 * value per package hands the other packages `''`, and `??` would have taken
 * that empty string literally and rooted every fixture lookup at the process's
 * working directory - a checkout that is "present" at a nonsense path is worse
 * than an absent one, because the gate below would pass.
 *
 * The default was previously six levels up plus `sherlo-tester`, which lands
 * INSIDE this repository rather than beside it - so before CI supplied the
 * override, the byte cases skipped even on a laptop with both repositories
 * cloned side by side, unless the developer exported the variable by hand.
 */
const TESTER_ROOT_OVERRIDE = process.env.SHERLO_TESTER_ROOT?.trim();

export const TESTER_ROOT =
  TESTER_ROOT_OVERRIDE || path.resolve(CLI_REPO_ROOT, '..', 'sherlo-tester');

/**
 * The file every ratchet needs before it can do anything: the shipped masker.
 * Its presence is the checkout's presence - a fixture-only copy would satisfy a
 * directory check and then fail at import time with a far worse message.
 */
const MASKER_PATH = path.join(TESTER_ROOT, 'e2e/helpers/test-app-init.ts');

export const TESTER_AVAILABLE = fs.existsSync(MASKER_PATH);

const IN_CI = process.env.CI === 'true' || process.env.CI === '1';

/**
 * Registers the two cases that make the skip visible and, in CI, impossible.
 * Call it once from each ratchet, inside its `describe`.
 *
 * Both are registered unconditionally. A gate expressed as `it.runIf(...)` would
 * vanish under exactly the condition it exists to catch.
 */
export function declareTesterCheckoutGate(): void {
  it('THE CHECKOUT GATE: sherlo-tester is MANDATORY in CI, optional on a laptop', () => {
    if (!IN_CI) return;
    expect(
      TESTER_AVAILABLE,
      `THE BYTE RATCHET DID NOT RUN. This is CI, and the sherlo-tester checkout that holds the ` +
        `committed fixtures is absent from ${TESTER_ROOT} - so every byte case in this file would ` +
        `have classified as SKIPPED and this suite would have gone green while proving nothing ` +
        `about what a real user sees. A developer is allowed that reduced proof; CI is not. The ` +
        `workflow is supposed to check the repository out via scripts/checkout-tester.sh and point ` +
        `SHERLO_TESTER_ROOT at it - if that step was removed, restore it; if it failed, its own ` +
        `error says whether the ref or the token was the problem. Do not "fix" this by relaxing ` +
        `the gate.`
    ).toBe(true);
  });

  it.skipIf(TESTER_AVAILABLE || IN_CI)(
    'SKIPPED (classified, local only): no sherlo-tester checkout, so the byte cases cannot run',
    () => {
      expect(TESTER_AVAILABLE).toBe(false);
    }
  );
}

/** Read a fixture committed in sherlo-tester, by its tester-relative path. */
export function committedFixture(fixture: string): string {
  return fs.readFileSync(path.join(TESTER_ROOT, fixture), 'utf8');
}

/** Whether a tester-relative fixture path exists in the checkout. */
export function fixtureExists(fixture: string): boolean {
  return fs.existsSync(path.join(TESTER_ROOT, fixture));
}

/** The shipped masker module, imported from the checkout rather than copied. */
export async function testerMasker(): Promise<Record<string, (raw: string) => string>> {
  return import(/* @vite-ignore */ MASKER_PATH);
}

/** The shipped CLI-output masker, whose module sits beside the app-init one. */
export async function testBundledMasker(): Promise<Record<string, (raw: string) => string>> {
  const modulePath = path.join(TESTER_ROOT, 'e2e/helpers/test-bundled/mask-cli-output.ts');
  return import(/* @vite-ignore */ modulePath);
}
