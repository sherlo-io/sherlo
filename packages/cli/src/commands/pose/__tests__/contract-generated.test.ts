/**
 * THE POSE CONTRACT IS GENERATED FROM THE SEAMS (sherlo / Drawing for a plan).
 *
 * `contracts/pose.contract.ts` and the shape reader in `readPose.ts` used to be written by hand,
 * so a field added to a seam's answer was written three times and drifted the first time somebody
 * forgot one. Both are generated from the seams' own types now, and a hand edit to either fails
 * this check. Written as a skeleton in plan (epic pose-road-hardening, task
 * pose-road-contract-generated); the worker fills the bodies and never renames a case.
 */
import { describe, it } from 'vitest';

describe('the pose contract and its reader are generated from the seam types', () => {
  it.todo(
    'the pose contract and its reader are generated from the seam types, and a hand edit to either fails the check'
  );
  it.todo('the generated contract carries no import, so a consumer can copy it verbatim');
  it.todo(
    'a field added to a seam answer type appears in the contract and is accepted by the reader after one generation'
  );
  it.todo(
    'the reader still refuses a missing field, an unknown key and a wrong type, naming every problem in one message'
  );
  it.todo(
    'the meaning checks the generator cannot derive - which commands bundle, which act on the machine - stay hand-written beside the generated reader'
  );
});
