// SPIKE: what the registry says about @napi-rs/keyring and its prebuilt binaries.
const latest = await (await fetch('https://registry.npmjs.org/@napi-rs/keyring/latest')).json();
console.log(
  JSON.stringify(
    {
      version: latest.version,
      main: latest.main,
      engines: latest.engines,
      dependencies: latest.dependencies,
      optionalDependencies: latest.optionalDependencies,
      unpackedSize: latest.dist.unpackedSize,
    },
    null,
    1
  )
);

for (const name of Object.keys(latest.optionalDependencies ?? {})) {
  const pkg = await (await fetch(`https://registry.npmjs.org/${name}/latest`)).json();
  console.log(name, pkg.version, 'os', pkg.os, 'cpu', pkg.cpu, 'libc', pkg.libc, 'unpacked', pkg.dist.unpackedSize, 'scripts', JSON.stringify(pkg.scripts ?? {}));
}
