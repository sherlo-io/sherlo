// Spike probe (not for commit): runs the CLI's own @expo/fingerprint over a
// project and reports (1) any `contents` source whose text still holds a
// machine-specific string (the absolute project path, the home folder, the
// user name), and (2) the hash with platforms ['android'], ['ios'] and both.
const path = require('path');
const os = require('os');
const { createFingerprintAsync } = require(path.join(__dirname, 'node_modules/@expo/fingerprint'));

async function main() {
  const projectRoot = path.resolve(process.argv[2]);
  const needles = [projectRoot, os.homedir(), os.userInfo().username, '/Users/', 'darwin', 'macos'];

  const both = await createFingerprintAsync(projectRoot, {});
  for (const source of both.sources) {
    const text = source.type === 'contents' ? String(source.contents) : source.filePath;
    const hits = needles.filter((needle) => text.toLowerCase().includes(needle.toLowerCase()));
    if (hits.length > 0) console.log(`MACHINE-SPECIFIC ${source.type} ${source.id ?? source.filePath}: ${hits.join(', ')}`);
  }
  console.log(`sources ${both.sources.length}`);
  console.log(`hash both    ${both.hash}`);
  for (const platform of ['android', 'ios']) {
    const one = await createFingerprintAsync(projectRoot, { platforms: [platform] });
    console.log(`hash ${platform.padEnd(7)} ${one.hash} (${one.sources.length} sources)`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
