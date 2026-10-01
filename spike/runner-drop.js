// Spike: do what the runner would do before a test - put a core into an installed iOS simulator
// app's storage folder (Documents/sherlo/), next to where config.sherlo goes. Nothing in the .app
// itself is touched, so nothing needs re-signing.
//
//   node spike/runner-drop.js <app data container> <folder holding sherlo-core.js[.sig]>
//   node spike/runner-drop.js <app data container> --clear
//
// The container comes from: xcrun simctl get_app_container <udid> <bundle id> data
const fs = require('fs');
const path = require('path');

const [container, from] = process.argv.slice(2);
const sherloFolder = path.join(container, 'Documents', 'sherlo');
const names = ['sherlo-core.js', 'sherlo-core.js.sig'];

fs.mkdirSync(sherloFolder, { recursive: true });
for (const name of names) fs.rmSync(path.join(sherloFolder, name), { force: true });

if (from !== '--clear') {
  for (const name of names) {
    const source = path.join(from, name);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(sherloFolder, name));
  }
}

console.log(sherloFolder + ': ' + (fs.readdirSync(sherloFolder).join(', ') || '(empty)'));
