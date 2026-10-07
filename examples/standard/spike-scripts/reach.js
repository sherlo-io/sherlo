// SPIKE (launch-time-entry): reads a Metro bundle (unminified, dev or release with --minify false)
// and reports which modules each side of the generated entry reaches, so "only one side is
// evaluated" can be checked statically: Metro runs a module only when something requires it.
// Usage: node spike-scripts/reach.js <bundle>
const fs = require('fs');

const bundle = fs.readFileSync(process.argv[2], 'utf8');
const modules = new Map(); // id -> { deps, name, start }
const defineRe = /\},(\d+),\[([\w,]*)\],"([^"]+)"\);/g;
let match;
while ((match = defineRe.exec(bundle))) {
  modules.set(Number(match[1]), {
    deps: match[2] ? match[2].split(',').filter((d) => d !== 'null').map(Number) : [],
    name: match[3],
  });
}
const runs = [...bundle.matchAll(/^__r\((\d+)\);$/gm)].map((m) => Number(m[1]));

function reach(fromIds) {
  const seen = new Set();
  const stack = [...fromIds];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id) || !modules.has(id)) continue;
    seen.add(id);
    stack.push(...modules.get(id).deps);
  }
  return seen;
}

function idOf(name) {
  for (const [id, m] of modules) if (m.name === name) return id;
  return undefined;
}

const names = (set) => [...set].map((id) => modules.get(id).name);
const has = (set, part) => names(set).some((n) => n.includes(part));

// Variant A: the generated entry is its own module. Variant B: the app entry's own path carries
// the generated source, and the original app entry is a copy in the cache folder.
const variantBCopy = idOf('node_modules/.cache/sherlo/app-entry-original.ts') ?? idOf('node_modules/.cache/sherlo/app-entry-original.js');
const generated = idOf('node_modules/.cache/sherlo/launch-time-entry.js') ?? (variantBCopy !== undefined ? idOf('index.ts') ?? idOf('node_modules/expo-router/entry.js') ?? idOf('index.js') : undefined);
const appEntry = variantBCopy ?? idOf('index.ts') ?? idOf('node_modules/expo-router/entry.js') ?? idOf('index.js');
console.log('variant:', variantBCopy !== undefined ? 'B (transformer)' : 'A (resolver)');
const storybookEntry = idOf('.rnstorybook/index.ts');
console.log('modules in bundle:', modules.size, '| run at start:', runs.map((id) => modules.get(id)?.name));
console.log('generated entry id:', generated, 'deps:', generated !== undefined ? modules.get(generated).deps.map((d) => modules.get(d)?.name) : '-');

const preEntry = reach(runs.filter((id) => id !== generated));
console.log('before the entry (InitializeCore etc.) reaches App.tsx?', has(preEntry, 'App.tsx'), '| a story?', has(preEntry, '.stories.'), '| .rnstorybook?', has(preEntry, '.rnstorybook'));

const checks = [
  ['App.tsx', 'App.tsx'],
  ['router screen src/app/index.tsx', 'src/app/index.tsx'],
  ['any story', '.stories.'],
  ['@storybook/react-native', '@storybook/react-native/'],
  ['@storybook/react-native-ui', '@storybook/react-native-ui'],
  ['@sherlo (any)', '@sherlo/'],
  ['sherlo storybook-wrapper', 'storybook-wrapper.js'],
];
for (const [label, entryId] of [['app side', appEntry], ['storybook side', storybookEntry]]) {
  if (entryId === undefined) {
    console.log(label + ': entry not in bundle');
    continue;
  }
  const set = reach([entryId]);
  console.log(label + ' (' + modules.get(entryId).name + ', ' + set.size + ' modules):', checks.map(([l, p]) => l + '=' + has(set, p)).join(' '));
}
console.log('whole bundle:', checks.map(([l, p]) => l + '=' + names(new Set(modules.keys())).some((n) => n.includes(p))).join(' '));
