# The pose catalogue

One file per scenario, grouped by command. A pose says what the user typed and what the world
answered; `sherlo pose <file>` runs the real command against it and prints the whole screen. The
shape is `contracts/pose.contract.ts`. The rendered bytes of every pose here are committed beside
it as `<name>.txt`, and a test re-renders each and compares, so a change to the tool's wording shows
as a diff in the pull request that made it.

There is no table of scenarios in code any more: a scenario is a pose file with a name.

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

## Open seams

`binary-abi-x86-only` (a native build whose libraries carry no arm64 slice) poses what the tool
reads OUT OF A BINARY, not a file's bytes. That is a fourth seam - the binary inspector - and it is
not in the contract yet; the scenario stays in the emit road's table until the seam is declared.
