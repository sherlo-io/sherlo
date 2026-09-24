/**
 * ONE MASKER, THE TOOL'S OWN (sherlo / Drawing for a plan, "What the tool folds on its own").
 *
 * A screen carries values no plan can state and no fixture should pin. The tool folds each of
 * them to a placeholder by CLASS, on every screen `sherlo pose` prints, and the same folding is
 * reachable from outside through a hidden devtool verb so the test repository applies it to a real
 * run's screen. Written as a skeleton in plan (epic pose-road-hardening, task pose-road-masker);
 * the worker fills the bodies and never renames a case.
 */
import { describe, it } from 'vitest';

describe('the masker folds every volatile class the tool prints', () => {
  it.todo(
    'every volatile class the tool prints is folded to one placeholder, by class, on a posed screen and on a live screen alike'
  );
  it.todo(
    'folds a token wherever it appears - after --token, after token:, in a build url, in an Authorization header'
  );
  it.todo(
    'folds a build url, a size in megabytes, a duration, the time since a build and a base fingerprint'
  );
  it.todo('folds the progress lines a wait prints to one placeholder, however many a run printed');
  it.todo('folds a commit id, a run namespace in a branch name, a team id and a project index');
  it.todo("folds a capture record's settle time, screenful count and measured size");
  it.todo(
    'strips the terminal artifacts a live run leaves - spinner redraws and the cursor-show sequence'
  );
  it.todo('never folds a value the pose declares - a story count, a wait deadline, a branch name');
});

describe('sherlo mask - the same folding for a screen the tool did not print itself', () => {
  it.todo(
    'reads a screen on stdin and prints it folded, byte for byte what applyMasks would have produced'
  );
  it.todo('takes the project root and the config path as flags, because a live run has its own');
  it.todo('is hidden unless SHERLO_DEVTOOLS=1, like sherlo pose');
});

describe('a pose declares only a scenario literal in masks', () => {
  it.todo('the catalogue refuses a pose whose masks entry duplicates a class the tool already folds');
});
