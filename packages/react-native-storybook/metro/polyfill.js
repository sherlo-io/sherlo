'use strict';

// Sherlo metro polyfill - diagnostic only.
//
// Earlier versions tried to install ErrorUtils handlers and patch AppRegistry
// from here. Both are unreliable in modern RN: setUpErrorHandling.js is
// skipped when RN$useAlwaysAvailableJSErrorHandling=true (default in new
// architecture), and react-native isn't loaded at polyfill time so AppRegistry
// is unreachable.
//
// The actual capture lives in the SDK's src/index.ts as a module side effect -
// at that point the user's App.tsx is being required, react-native is already
// loaded, and registerRootComponent hasn't been called yet.
if (typeof console !== 'undefined' && typeof console.warn === 'function') {
  console.warn('[Sherlo] metro polyfill loaded');
}
