// mocks/expo-localization.js
const DEBUG = true;
const log = (...a) => DEBUG && console.log('[SHERLO:mock expo-localization]', ...a);

let isStorybookMode = false;
try {
  // if this import throws, we fall back to real to avoid blank screens
  ({ isStorybookMode } = require('@sherlo/react-native-storybook'));
} catch (e) {
  log('could not import @sherlo/react-native-storybook:', e?.message);
}

function loadReal() {
  try {
    const mod = require('expo-localization:real');
    // Handle both ESM (default export) and CJS (named exports)
    const real = mod && mod.__esModule && mod.default ? mod.default : mod;
    log('loaded real; keys=', Object.keys(real || {}));
    return real;
  } catch (e) {
    log('FAILED to load real via :real alias:', e?.message);
    return null;
  }
}

const dummy = {
  locale: 'fr-FR',
  locales: ['fr-FR'],
  getLocales: () => [{ languageCode: 'fr', countryCode: 'FR' }],
  // include other common properties to avoid undefined access
  timezone: 'Europe/Paris',
  isRTL: false,
};

const real = isStorybookMode ? null : loadReal();

// Choose impl; never export null/undefined
const impl = real || dummy;

// Export as a plain object (no getters) to avoid weird proxying issues
const out = { ...impl };

// Support both `import * as Localization` and default/named imports
module.exports = out;
module.exports.__esModule = true;
module.exports.default = out;
