import { describe, expect, it } from 'vitest';
import { sha256OfBuffer } from '../sha256OfBuffer';

describe('the digest of a buffer', () => {
  it('gives the hex sha256 of the bytes', () => {
    expect(sha256OfBuffer(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });
});
