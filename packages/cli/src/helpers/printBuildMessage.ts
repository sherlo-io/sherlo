import { emit } from './transcriptSink';

/**
 * The generic `➜ ` / `✔ ` build line, for the call sites that compose their own
 * message string (testEasCloudBuild, getBuildData).
 *
 * The push spine does NOT go through here any more - its two lines carry data
 * (`binary-uploading`, `binary-reused`) so a scenario cannot hand a rendered
 * sentence to the renderer. Both roads share the same icon-and-spacing
 * implementation in ../render/pushSpine, so an unfixtured call site cannot drift
 * from a fixtured one.
 */
function printBuildMessage({
  message,
  type,
  endsWithNewLine,
}: {
  message: string;
  type: 'info' | 'success';
  endsWithNewLine?: boolean;
}) {
  emit({ kind: 'build-message', message, type, ...(endsWithNewLine ? { endsWithNewLine } : {}) });
}

export default printBuildMessage;
