// SPIKE ONLY, not part of the product: this copy lives under brain's .worktrees folder, which
// brain's own .watchmanconfig ignores, so Metro (through watchman) cannot see the app's files.
// The app's own Metro config, with watchman off. METRO_APP_ROOT names the app.
const path = require('path');

const appRoot = process.env.METRO_APP_ROOT ?? process.cwd();
const appConfig = require(path.join(appRoot, 'metro.config.js'));

module.exports = Promise.resolve(typeof appConfig === 'function' ? appConfig() : appConfig).then((config) => ({
  ...config,
  resolver: { ...config.resolver, useWatchman: false },
}));
