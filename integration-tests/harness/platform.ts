import type { SbVersion } from './sb-version.js';

export const PLATFORM = (process.env.PLATFORM ?? 'android') as 'android' | 'ios';

if (PLATFORM !== 'android' && PLATFORM !== 'ios') {
  throw new Error(`Invalid PLATFORM env: '${process.env.PLATFORM}' (expected 'android' or 'ios')`);
}

// Android targets all three sb-versions; iOS only sb10 (lighter - native module coverage is what we care about, not sb-version matrix).
export const SB_VERSIONS = (PLATFORM === 'ios' ? ['sb10'] : ['sb10', 'sb9', 'sb8']) as readonly SbVersion[];
