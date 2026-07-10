import start from './start';

export * as commands from './commands';
export * as constants from './constants';

// Exposed on the package's public entry so the packaging regression test
// (src/helpers/fingerprint/__tests__/packagedFingerprint.test.ts) can invoke
// the EXACT bundled base-fingerprint path from the installed CLI artifact,
// proving @expo/fingerprint's spawned ExpoConfigLoader.js helper is reachable
// at runtime. See SHERLO-1742.
export { computeBaseFingerprint } from './helpers/fingerprint';

export default start;
