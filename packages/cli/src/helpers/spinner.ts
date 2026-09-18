import ora, { type Options, type Ora } from 'ora';

type SpinnerStream = NodeJS.WritableStream & { columns?: number };

/**
 * Every `sherlo` spinner goes through here instead of calling `ora` directly.
 *
 * ora sizes its clear-line count from `this.#stream.columns ?? 80` - `??` only falls back on
 * `null`/`undefined`, so a pty whose window size was never set (a container run without `-t`,
 * some CI images, `script(1)`) reports `columns` as `0`, not `undefined`, and that `0` survives.
 * Dividing by it turns ora's internal line count into `Infinity`, and every animation frame then
 * loops that many times writing `\x1b[1A\x1b[0K` - an unbounded escape stream the command never
 * gets past. `helpers/wrapInBox.ts` hit the identical `0` vs `undefined` hazard and guards it with
 * `||`; this does the same, by handing ora a stream whose `columns` reads `80` whenever the real
 * one is falsy, so a terminal of unknown width is treated as one of known (80-column) width
 * instead of zero width.
 */
function spinner(options: string | Options): Ora {
  const resolvedOptions = typeof options === 'string' ? { text: options } : options;
  const stream = (resolvedOptions.stream as SpinnerStream | undefined) ?? process.stderr;

  return ora({ ...resolvedOptions, stream: withKnownWidth(stream) });
}

export default spinner;

/* ========================================================================== */

function withKnownWidth(stream: SpinnerStream): SpinnerStream {
  if (stream.columns) return stream;

  return new Proxy(stream, {
    get(target, property, receiver) {
      if (property === 'columns') return 80;
      return Reflect.get(target, property, receiver);
    },
  });
}
