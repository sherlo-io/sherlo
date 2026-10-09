/**
 * THE PIN that keeps CI's half of the byte ratchet wired up.
 *
 * The gate in `testerCheckout.ts` reds when a CI run has no sherlo-tester
 * checkout - that is the load-bearing enforcement, and it catches a removed
 * workflow step at the moment it matters. This file is the cheaper, earlier
 * layer: it reads the two workflows that are supposed to provide the checkout
 * and asserts they still do, so the failure names the YAML line instead of
 * arriving as a puzzling red inside a render-layer suite.
 *
 * It pins INTENT, not formatting: that the cli lanes call
 * `scripts/checkout-tester.sh` and export `SHERLO_TESTER_ROOT` to the unit-test
 * step. Rewriting how either is spelled is fine; dropping either is not.
 */
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const WORKFLOWS = path.resolve(__dirname, '../../../../../../.github/workflows');

/** Every workflow that runs packages/cli's unit suite, and therefore owes it the checkout. */
const LANES = ['pr_checks.yml', 'manual_tests.yml'];

function workflow(name: string): string {
  return fs.readFileSync(path.join(WORKFLOWS, name), 'utf8');
}

describe('the workflows that run the CLI unit suite', () => {
  for (const name of LANES) {
    it(`${name} checks sherlo-tester out for the byte ratchet`, () => {
      expect(
        workflow(name),
        `${name} runs packages/cli's unit suite but no longer calls scripts/checkout-tester.sh. ` +
          'Without that checkout every byte case in the render-layer ratchets has nothing to ' +
          'compare against, and the lane would go green having proved nothing about what a real ' +
          'user sees. Restore the step rather than relaxing this pin.'
      ).toContain('scripts/checkout-tester.sh');
    });

    it(`${name} points the suite at that checkout`, () => {
      expect(
        workflow(name),
        `${name} checks sherlo-tester out but never exports SHERLO_TESTER_ROOT, so the suite ` +
          'would look for the fixtures beside this repository and find nothing - a checkout ' +
          'nobody is told about is the same as no checkout.'
      ).toContain('SHERLO_TESTER_ROOT');
    });
  }
});
