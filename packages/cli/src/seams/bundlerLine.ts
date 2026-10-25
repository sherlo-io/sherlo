/**
 * THE BUNDLER'S LINE - the one address both `sherlo open` and `sherlo capture` reach a developer's
 * running app down, shared by their two seams (`letterbox.ts` and `captureSocket.ts`).
 *
 * The bundler serves the line at `/sherlo/line` on its own port (the SDK's `metro/sherloLine.js`),
 * and mounts it on its first HTTP request. So a question goes in two steps:
 *
 *     1. one plain GET to the same address, which wakes the line and answers with the protocol it
 *        speaks - and which tells a port with nothing on it from a port with something else on it;
 *     2. a WebSocket to the address, one question on it, and the one reply that comes back.
 *
 * The questions and replies are the SDK's own types (`metro/sherloLine.d.ts`), never declared again
 * here. The seams read the reply into their own named endings.
 */
import WebSocket from 'ws';
import { LINE_PATH, PROTOCOL_VERSION } from '../../../react-native-storybook/metro/sherloLine';
import type {
  Question,
  QuestionMessage,
  ReplyMessage,
  ReplyTo,
} from '../../../react-native-storybook/metro/sherloLine';

/** What came back from asking the line one question. */
export type BundlerLineAnswer<AskedQuestion extends Question> =
  /** Nothing accepted a connection. */
  | { kind: 'nothing-on-the-port' }
  /** Something answered, and not in words this tool can read: a bundler nobody routed through
   * Sherlo, a line speaking another protocol, a different server on the port entirely, or a line
   * that broke. `detail` is the line's own account: the fetch error, the status, the close code. */
  | { kind: 'not-in-sherlos-words'; detail: string }
  /** Nothing answered before the tool stopped listening. */
  | { kind: 'gave-up-waiting' }
  /** The line answered, and here is what it said. */
  | { kind: 'said'; reply: ReplyTo<AskedQuestion> };

/**
 * Ask the line on the bundler at `port` one question, and wait up to `patienceMs` for its reply.
 * Every way of not getting a reply is one of the answers above, never a thrown error.
 */
export async function askTheBundlerLine<AskedQuestion extends Question>({
  port,
  question,
  patienceMs,
}: {
  port: number;
  question: AskedQuestion;
  patienceMs: number;
}): Promise<BundlerLineAnswer<AskedQuestion>> {
  const lineWoken = await wakeTheLine(port, patienceMs);
  if (lineWoken.kind !== 'awake') return lineWoken;

  return askOverTheWebSocket({ port, question, patienceMs });
}

/**
 * The plain GET that comes before the WebSocket. The bundler answers it with the protocol the line
 * speaks, and a line speaking another protocol than this tool's is not one it can talk to.
 */
async function wakeTheLine(
  port: number,
  patienceMs: number
): Promise<
  | { kind: 'awake' }
  | { kind: 'nothing-on-the-port' }
  | { kind: 'not-in-sherlos-words'; detail: string }
  | { kind: 'gave-up-waiting' }
> {
  let response: Response;

  try {
    response = await fetch(`http://localhost:${port}${LINE_PATH}`, {
      signal: AbortSignal.timeout(patienceMs),
    });
  } catch (error) {
    if (isNothingOnThePort(error)) return { kind: 'nothing-on-the-port' };
    if ((error as Error | undefined)?.name === 'TimeoutError') return { kind: 'gave-up-waiting' };
    return { kind: 'not-in-sherlos-words', detail: `the GET failed: ${describeError(error)}` };
  }

  if (!response.ok) {
    return { kind: 'not-in-sherlos-words', detail: `the GET answered ${response.status}` };
  }

  try {
    const said = (await response.json()) as { protocolVersion?: unknown } | null;
    return said?.protocolVersion === PROTOCOL_VERSION
      ? { kind: 'awake' }
      : {
          kind: 'not-in-sherlos-words',
          detail: `the line speaks protocol ${String(said?.protocolVersion)}, not ${PROTOCOL_VERSION}`,
        };
  } catch (_error) {
    return { kind: 'not-in-sherlos-words', detail: 'the GET answered in words that are not JSON' };
  }
}

/** One question on a socket of its own, the way the SDK's line takes a driver's question. */
function askOverTheWebSocket<AskedQuestion extends Question>({
  port,
  question,
  patienceMs,
}: {
  port: number;
  question: AskedQuestion;
  patienceMs: number;
}): Promise<BundlerLineAnswer<AskedQuestion>> {
  return new Promise((resolve) => {
    const socket = new WebSocket(`ws://localhost:${port}${LINE_PATH}`);
    const askId = 'the-one-question';

    const patience = setTimeout(() => finish({ kind: 'gave-up-waiting' }), patienceMs);

    /** The first ending wins; later ones (the socket closing after we closed it) change nothing. */
    function finish(answer: BundlerLineAnswer<AskedQuestion>): void {
      clearTimeout(patience);
      socket.terminate();
      resolve(answer);
    }

    socket.on('open', () => {
      const message: QuestionMessage = { ...question, askId };
      socket.send(JSON.stringify(message));
    });

    socket.on('message', (data) => {
      const reply = readReply(data.toString(), askId);
      if (reply) finish({ kind: 'said', reply: reply as ReplyTo<AskedQuestion> });
    });

    socket.on('error', (error) =>
      finish({ kind: 'not-in-sherlos-words', detail: `the socket failed: ${describeError(error)}` })
    );
    socket.on('close', (code, reason) =>
      finish({
        kind: 'not-in-sherlos-words',
        detail: `the socket closed with code ${code}${reason.length > 0 ? ` (${reason})` : ''}`,
      })
    );
  });
}

/** The reply to the question with this `askId`, or nothing when the frame is any other message. */
function readReply(frame: string, askId: string): ReplyMessage['reply'] | undefined {
  try {
    const message = JSON.parse(frame) as Partial<ReplyMessage> | null;
    return message?.action === 'reply' && message.askId === askId ? message.reply : undefined;
  } catch (_error) {
    return undefined;
  }
}

/**
 * `localhost` is two addresses on most machines, so a refusal can arrive as one code or as a list
 * of them - one per address tried. Both shapes mean the same thing: nothing accepted a connection.
 */
function isNothingOnThePort(error: unknown): boolean {
  const cause = (error as { cause?: { code?: unknown; errors?: { code?: unknown }[] } } | undefined)
    ?.cause;
  const codes = [cause?.code, ...(cause?.errors ?? []).map((one) => one.code)];

  return codes.some((code) => code === 'ECONNREFUSED' || code === 'ENOTFOUND');
}

/** An error in a few words: its own message, and the code of what caused it when it has one. */
function describeError(error: unknown): string {
  const failure = error as { message?: unknown; cause?: { code?: unknown } } | undefined;
  const code = failure?.cause?.code;
  const message = typeof failure?.message === 'string' ? failure.message : String(error);
  return typeof code === 'string' ? `${message} (${code})` : message;
}
