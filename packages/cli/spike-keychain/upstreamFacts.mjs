// SPIKE: the upstream source of @napi-rs/keyring - which keyring store each OS picks by default.
const base = 'https://raw.githubusercontent.com/Brooooooklyn/keyring-node/main/';
const tree = await (
  await fetch('https://api.github.com/repos/Brooooooklyn/keyring-node/git/trees/main?recursive=1')
).json();
const sources = (tree.tree ?? []).map((node) => node.path).filter((p) => p.startsWith('src/') || p === 'README.md');
console.log('files:', sources.join(' '));
for (const file of sources) {
  const text = await (await fetch(base + file)).text();
  const interesting = text
    .split('\n')
    .map((line, index) => `${file}:${index + 1}: ${line}`)
    .filter((line) => /linux|keyutils|secret|dbus|default|store|Persistent|session|EntryOptions|macos|keychain|windows|prompt|access/i.test(line));
  console.log(interesting.slice(0, 80).join('\n'));
}
