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

## What a pose may not say

A sentence, a colour, a line of output, or an answer to a call the command never makes.

## A pose says the input, and the tool keeps its own word

Twice the two vocabularies differ, on purpose: a pose says `metro` and `hermes-bytecode` where the
tool prints `rn` and `hbc`. The pose names the bundler and the format a person writing one knows;
what reaches the screen is the tool's own word for them, which is what a real run prints.

## Open seams

`binary-abi-x86-only` (a native build whose libraries carry no arm64 slice) poses what the tool
reads OUT OF A BINARY, not a file's bytes. That is a fourth seam - the binary inspector - and it is
not in the contract yet; the scenario stays in the emit road's table until the seam is declared.

`sherlo test --wait` - the staged road's own screen, from the bundling block through the verdict -
cannot be posed yet, and the catalogue says so by not containing one. That road asks the backend
two questions the contract does not name (`checkStagedGate`, and the staged upload slots) and
computes a base fingerprint off a real React Native project before it asks either, so a pose of it
routes to `native-needed=true` long before it reaches `openBuild`. The verdict screens in
`view/verdict-*` pose the SAME closers through `sherlo view <build> --wait`, which reaches them
through `getBuildStatus` alone. The one verdict screen that has no posed form at all is the
`── details ──` block after `sherlo test --wait --metadata`: its git rows come from the run that
opened the build, and only the staged road has them to give.
