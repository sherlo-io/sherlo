// SPIKE (launch-time-entry): bundles the way `react-native bundle` does (Metro.runBuild ->
// Server.build -> IncrementalBundler.buildGraph), which turns --entry-file into a path with
// path.resolve and never asks the resolver. Shows whether the entry swap happens on that road.
// Usage: node spike-scripts/runbuild.js <dev:true|false> <out>
const path = require('path');
const projectRoot = path.join(__dirname, '..');
process.chdir(projectRoot);
const Metro = require(require.resolve('metro', { paths: [projectRoot] }));

async function main() {
  const dev = process.argv[2] === 'true';
  const out = path.resolve(projectRoot, process.argv[3]);
  const config = await Metro.loadConfig({ cwd: projectRoot, config: path.join(projectRoot, 'metro.config.js') });
  await Metro.runBuild(config, {
    entry: 'index.ts',
    dev,
    minify: false,
    platform: 'ios',
    out,
  });
  console.log('wrote', out);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
