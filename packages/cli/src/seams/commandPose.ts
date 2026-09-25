/**
 * THE POSE, COMPOSED FROM THE SEAMS - the one root type every copy of the pose shape is made of.
 *
 * A pose replaces the seams a command reaches the world through, so what a pose may say about a
 * seam is the seam's own business: each file in this folder declares the type it answers from,
 * and this module does nothing but name them side by side. That is the whole of the ordering -
 * a field added to a seam's answer is added once, here it is already in the pose, and
 * `../../scripts/generate-pose-contract.ts` writes it into `contracts/pose.contract.ts` and into
 * `../commands/pose/readPose.generated.ts` from this declaration.
 *
 * WHY THE TYPES POINT THIS WAY. They used to point the other way: the reader declared the posed
 * types and five seams imported them back, so the seam that answers a question did not own the
 * shape of its own answer, and the contract was a third hand-written copy that could go stale in
 * silence. Now there is one declaration per seam, one composition here, and two generated copies.
 */
import type { PosedBundle } from './bundler';
import type { PosedCapture } from './captureSocket';
import type { PosedLetterbox } from './letterbox';
import type { PosedPush } from './nativeBuild';
import type { PosedFiles } from './projectFiles';
import type { ScriptedCall } from './serverCalls';
import type { PosedGit } from './surroundings';
import type { PosedWorkstation } from './workstation';

/** The whole of what one command run needed in order to print what it printed. */
export type CommandPose = {
  /** The shape's version. Bumped when a field changes meaning; a reader refuses a version it does not know. */
  pose: 1;
  /**
   * The command line after the tool's own name, word by word, exactly as a shell would split it:
   * `["view", "3"]`, `["test", "--token", "not-a-real-token", "--android", "builds/app.apk"]`.
   * The tool's own routing decides which command runs and which checks fire, in what order.
   */
  argv: string[];
  /**
   * The project folder the command runs in: relative path -> content. A string is written as is;
   * an object is written as JSON. `{"sherlo.config.json": {"devices": []}}` poses the
   * empty-devices refusal; `{}` poses a folder with no config file. Nothing touches the disk: the
   * tool's file reads answer from this map, and a path outside it does not exist.
   */
  files: PosedFiles;
  /**
   * The settings the command reads from its surroundings, stated instead of inherited. An
   * unstated setting reads as unset - the pose says `SKIP_INTRO: "true"` or the logo prints. The
   * tool's own secret-bearing settings (a token in the environment) are posed here too, and
   * masked on output.
   */
  env: Record<string, string>;
  /**
   * What the git read answers. `"none"` is a folder that is not a repository at all;
   * `"unavailable"` is a read that failed (the tool prints its own warning for it); otherwise the
   * three facts the tool asks for.
   */
  git: PosedGit;
  /**
   * What bundling the app answers, per platform, for the commands that bundle (`sherlo test` on
   * the staged road, `--dry-run`). `{}` for a command that never reaches the bundler - a refusal,
   * a `view`, a `project create` - and a pose that supplies bundles to such a command is refused.
   * The story files are the closure keys the bundler reports, which is what Diff Scope diffs.
   */
  bundles: Record<string, PosedBundle>;
  /**
   * The server's answers, one per call the command makes, IN ORDER. Each entry names the call,
   * the arguments the command must make it with (checked, so a pose cannot script an answer to a
   * question the command did not ask), and the answer - which may be the error the server would
   * send. An answer's shape is the wire's own, written out per call; a pose describing a state
   * the backend cannot send does not compile against the contract and is refused at run time.
   */
  api: ScriptedCall[];
  /**
   * PLACEHOLDER -> THE LITERAL THE SCENARIO ITSELF PUT ON THE SCREEN, and nothing else.
   *
   * The tool folds every value only a machine knows on its own, by class and by shape: its
   * temporary project folder to `<PROJECT_ROOT>`, the resolved config path to
   * `<SHERLO_CONFIG_PATH>`, a token to `<MASKED>`, a build address, a size in megabytes, a
   * duration, the time since a build, a commit id, a base fingerprint, and the progress lines a
   * `--wait` printed while it waited (`../commands/pose/maskScreen`). The same folding is
   * reachable from outside as `sherlo mask` (stdin in, folded text out), so a live run's screen is
   * folded by the same rule as a posed one.
   *
   * A pose that hand-types one of those placeholders here is describing the masker rather than
   * its scenario, and the catalogue refuses it: an entry that duplicates the masker buys nothing
   * and rots the day the class moves. What is left for this field is the one thing only a scenario
   * knows: a literal it put on the screen itself, through its own `files`, `env` or `api`, and
   * wants read as a placeholder.
   */
  masks: Record<string, string>;
  /**
   * What a real push (`sherlo test --android <apk> [--ios <app>]`) read off the machine: the
   * binaries it was handed, the base fingerprint over the project's native inputs, and the clock.
   * THE ONE OPTIONAL FIELD, because only that road reads the machine - a refusal on it never gets
   * that far, and no other command opens a binary. A pose that states it for a command that never
   * reads a native build is refused; a push that reaches the machine with no `push` is refused at
   * run time, exactly like a call the pose did not script.
   */
  push?: PosedPush;
  /**
   * WHAT THE CLOCK ANSWERS WHILE THE COMMAND WAITS, ISO 8601, in the order the wait reads it. A
   * wait reads the clock once at its start and once before every poll; after the last instant
   * here the clock stands still. Absent, the clock stands at `push.now` (or at the run's start)
   * for the whole wait, so a wait ends only when a scripted `getBuildStatus` answer is terminal.
   * A clock that passes the deadline is how a wait that ran out is posed - the timed-out closer,
   * and exit code 3. A posed wait never sleeps: the instants here are the whole passage of time.
   */
  clock?: string[];
  /**
   * What `sherlo init` did TO the machine: the package the manager answered the install with, and
   * whether anybody pressed Enter at the prompt. THE OTHER OPTIONAL FIELD, because `init` is the
   * only command that ACTS on the machine rather than reading it - it adds a package and it stops
   * for a key, and neither exists on a machine that only has the pose. A pose that states it for a
   * command that does neither is refused; an `init` that reaches either act with no `workstation`
   * is refused at run time, exactly like a call the pose did not script.
   */
  workstation?: PosedWorkstation;
  /**
   * What the bundler's letterbox answered - the road `sherlo open` reaches the developer's
   * running app down. THE THIRD OPTIONAL FIELD, and for the same reason as the other two: no
   * other command has a running app to talk to, and a machine that only has the pose has no
   * bundler and no app. A pose that states it for a command that never posts to the letterbox is
   * refused; a command that reaches the letterbox with no `letterbox` is refused at run time,
   * exactly like a call the pose did not script.
   */
  letterbox?: PosedLetterbox;
  /**
   * What the running app answered down the capture socket - the road `sherlo capture` reaches it
   * down. THE FOURTH OPTIONAL FIELD, for the one command that talks to it: a pose that states it
   * for any other command is refused, and a capture with no `capture` is refused at run time.
   */
  capture?: PosedCapture;
};
