/**
 * THE STORY LIST - the question `sherlo capture --list` puts to the bundler's line: which story
 * ids does the running app have? The line answers from what the app last said, so nothing is
 * restarted and no picture is taken.
 */
import { withPortTheAppAsks } from './appBundlerPort';
import { keepStrings } from './appLog';
import { askTheBundlerLine } from './bundlerLine';
import type { CaptureResult } from './captureSocket';

/** How long the tool waits: the line answers from memory, so any real delay is another server. */
const LIST_PATIENCE_MS = 5000;

/** What the app answered about its story ids: the two endings a capture has, or the ids. */
export type StoryListResult =
  | Extract<CaptureResult, { kind: 'no-bundler' | 'no-app' }>
  | { kind: 'listed'; ids: string[] };

/** Ask the line on this port for the story ids of the running app. */
export async function listLiveStories(port: number): Promise<StoryListResult> {
  const answer = await askTheBundlerLine({
    port,
    question: { action: 'listStories' },
    patienceMs: LIST_PATIENCE_MS,
  });

  if (answer.kind === 'nothing-on-the-port') return { kind: 'no-bundler' };
  if (answer.kind !== 'said' || answer.reply.kind === 'no-app') {
    return withPortTheAppAsks({ kind: 'no-app' as const }, port);
  }
  return { kind: 'listed', ids: keepStrings(answer.reply.stories) };
}
