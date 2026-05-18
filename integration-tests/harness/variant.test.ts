import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  copyFileSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  readFileSync: vi.fn(),
  rmdirSync: vi.fn(),
  rmSync: vi.fn(),
  unlinkSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import { existsSync, readFileSync } from 'node:fs';
import { isVariantCompatible, VariantIncompatibleError } from './variant.js';

const mockExists = vi.mocked(existsSync);
const mockReadFile = vi.mocked(readFileSync);

beforeEach(() => {
  vi.resetAllMocks();
});

// ── isVariantCompatible ───────────────────────────────────────────────────────

describe('isVariantCompatible()', () => {
  it('returns true when variant.json does not exist', () => {
    mockExists.mockReturnValue(false);
    expect(isVariantCompatible('a1-single-export', 'sb10')).toBe(true);
  });

  it('returns true when compatibleWith is absent', () => {
    mockExists.mockReturnValue(true);
    mockReadFile.mockReturnValue(JSON.stringify({}) as any);
    expect(isVariantCompatible('a1-single-export', 'sb10')).toBe(true);
  });

  it('returns true when compatibleWith is empty array', () => {
    mockExists.mockReturnValue(true);
    mockReadFile.mockReturnValue(JSON.stringify({ compatibleWith: [] }) as any);
    expect(isVariantCompatible('a1-single-export', 'sb10')).toBe(true);
  });

  it('returns true when sbVersion is in compatibleWith', () => {
    mockExists.mockReturnValue(true);
    mockReadFile.mockReturnValue(JSON.stringify({ compatibleWith: ['sb10'] }) as any);
    expect(isVariantCompatible('a4-csf-factory', 'sb10')).toBe(true);
  });

  it('returns false when sbVersion is not in compatibleWith', () => {
    mockExists.mockReturnValue(true);
    mockReadFile.mockReturnValue(JSON.stringify({ compatibleWith: ['sb10'] }) as any);
    expect(isVariantCompatible('a4-csf-factory', 'sb9')).toBe(false);
  });

  it('returns false for sb8 when only sb10 is declared', () => {
    mockExists.mockReturnValue(true);
    mockReadFile.mockReturnValue(JSON.stringify({ compatibleWith: ['sb10'] }) as any);
    expect(isVariantCompatible('a4-csf-factory', 'sb8')).toBe(false);
  });
});

// ── VariantIncompatibleError ──────────────────────────────────────────────────

describe('VariantIncompatibleError', () => {
  it('has the correct name and message', () => {
    const err = new VariantIncompatibleError('a4-csf-factory', 'sb9', ['sb10']);
    expect(err.name).toBe('VariantIncompatibleError');
    expect(err.message).toContain('a4-csf-factory');
    expect(err.message).toContain('sb9');
    expect(err.message).toContain('sb10');
    expect(err).toBeInstanceOf(Error);
  });

  it('exposes variantName and sbVersion fields', () => {
    const err = new VariantIncompatibleError('a4-csf-factory', 'sb9', ['sb10']);
    expect(err.variantName).toBe('a4-csf-factory');
    expect(err.sbVersion).toBe('sb9');
    expect(err.compatibleWith).toEqual(['sb10']);
  });
});
