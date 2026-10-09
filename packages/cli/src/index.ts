import start from './start';

export * as commands from './commands';
export * as constants from './constants';

// Exposed on the package's public entry so the packaging check
// (scripts/check-packed-fingerprint.js, a step of the pull request check) can invoke
// the EXACT bundled base-fingerprint path from the installed CLI artifact,
// proving @expo/fingerprint's spawned ExpoConfigLoader.js helper is reachable
// at runtime. See SHERLO-1742.
export { computeBaseFingerprint } from './helpers/fingerprint';

export default start;
