/**
 * The one sentence a git failure is worth: the shell error `executeCommand` throws carries the
 * subprocess's own stderr (e.g. `fatal: not a git repository (or any of the parent
 * directories): .git`), which is the reason a reader needs - everything else on that error
 * (its stack, `code`/`killed`/`signal`, this machine's paths) is the tool's own internals, not
 * theirs to read. Falls back to the error's `message` for anything that isn't a failed shell
 * command (e.g. a plain `Error` a caller states directly).
 */
export default function gitFailureReason(error: unknown): string {
  if (error && typeof error === 'object') {
    const { stderr, message } = error as { stderr?: unknown; message?: unknown };
    if (typeof stderr === 'string' && stderr.trim().length > 0) return stderr.trim();
    if (typeof message === 'string') return message;
  }
  return String(error);
}
