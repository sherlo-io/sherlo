# The pose catalogue

One file per scenario, grouped by the command it poses. A pose says what the user typed and what
the world answered; `sherlo pose <file>` runs the real command against it and prints the whole
screen. The shape is `contracts/pose.contract.ts`. The rendered bytes of every pose here are
committed beside it as `<name>.txt`, and a test re-renders each and compares, so a change to the
tool's wording shows as a diff in the pull request that made it.

There is no table of scenarios in code any more: a scenario is a pose file with a name.

## Running one

`sherlo pose` is hidden unless `SHERLO_DEVTOOLS=1` - it is a tool for the people who work on the
tool. Pass `-` to read the document from stdin.

```
SHERLO_DEVTOOLS=1 sherlo pose packages/cli/poses/view/finished-no-changes.pose.json
```

## Re-minting the screens

When the tool's wording changes on purpose, re-mint in the SAME pull request that changed it and
read the diff like any other diff:

```
ALLOW_LOCAL_TEST_EXEC=1 MINT_POSES=1 yarn test src/commands/pose/__tests__/catalogue.test.ts
```

(from `packages/cli`). Without `MINT_POSES` that test only ever compares - a ratchet that could
quietly rewrite its own baseline is not a ratchet.

## What a pose may say

- `argv` - the command line after `sherlo`, word by word. The tool routes it; the pose does not say
  which checks run.
- `files` - the project folder, path to content. `{}` is a folder with nothing in it.
- `env` - the settings the command reads. Unstated means unset.
- `git` - what the git read answers, or `"none"` / `"unavailable"`.
- `bundles` - what bundling answers, per platform, for the commands that bundle. `{}` otherwise.
- `api` - the server's answers, one per call, in order, each checked against the arguments the
  command actually made the call with.
- `masks` - placeholders for values only a machine knows. The temporary project folder and the
  resolved config path are folded without being asked.
- `push` - what a real push (`test --android <apk>`) read off the machine: per binary, what the
  tool found inside the file (its hash, its size, the SDK baked in, whether it embeds a bundle,
  the gate facts); the base fingerprint, or why there was none; and the clock. The one optional
  field - only that road reads the machine, and a pose that states it for any other command is
  refused. The server's two answers on that road (`getNextBuildInfo`, `getStagedUploadUrls`) are
  scripted in `api` like every other call; `reuse` on the first is what the
  `reusing unchanged build (Test 1, 7 minutes ago)` line is printed from.

## What a pose may not say

A sentence, a colour, a line of output, or an answer to a call the command never makes.

## A pose says the input, and the tool keeps its own word

Twice the two vocabularies differ, on purpose: a pose says `metro` and `hermes-bytecode` where the
tool prints `rn` and `hbc`. The pose names the bundler and the format a person writing one knows;
what reaches the screen is the tool's own word for them, which is what a real run prints.

## Open seams

A REAL PUSH IS POSABLE (2026-09-15): `test/push-*` pose `sherlo test --android <apk> --wait` from
the run header through the verdict, through the fifth seam - `src/seams/nativeBuild.ts`, what the
tool reads off the machine. `binary-abi-x86-only` (a native build whose libraries carry no arm64
slice) is now a pose away: `push.binaries.android.androidAbis` without `arm64-v8a`.

`sherlo test --wait` WITHOUT build paths - the staged road's own screen - is posable since
2026-09-18 (epic legacy-road-closed): the gate the road asks before it bundles is a scripted call
(`checkStagedGate`, asked once per platform before the bundle and once after it with the bundle's
real identity), and a wait that runs out is posed through the pose's `clock` - the instants the
wait reads, in order, so a deadline can pass without a timer. The tester's push saga poses both;
this catalogue does not hold a screen for them yet (the storyline tasks of that epic mint them). The
verdict screens in `view/verdict-*` pose the SAME closers through `sherlo view <build> --wait`,
which reaches them through `getBuildStatus` alone. The `── details ──` block after `sherlo test --wait --metadata` is now
reachable through a push pose, since the run that opened the build has the git rows to give.
