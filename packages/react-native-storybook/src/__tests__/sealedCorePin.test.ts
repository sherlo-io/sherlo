/**
 * The pinned core: the pin file (../../sherlo-core.json) that names the one stored core the SDK
 * packs, the pin tool that writes it, and the pack that fetches, checks and lays that core.
 */
import { describe, it } from 'vitest';

describe('the pin', () => {
  it('the pin names one stored core by version, fingerprint, runner commit, source tree and seam hash', () => {});
});

describe('the pin tool', () => {
  it("the pin tool writes the pin from a stored core's manifest", () => {});

  it('the pin tool refuses a core that is not stored yet', () => {});

  it('the pin tool with no package token fails, naming the token', () => {});
});

describe('a pack', () => {
  it('a pack with no package token fails, naming the token', () => {});

  it('a pack fetches the core stored under the pinned fingerprint', () => {});

  it('a pack refuses a pin to a core that is not stored', () => {});

  it('a pack refuses a core file whose hash differs from its manifest', () => {});

  it("a pack refuses a core whose seam hash differs from the SDK's own seam", () => {});

  it("a pack lays the pinned core's four paths before it packs", () => {});
});
