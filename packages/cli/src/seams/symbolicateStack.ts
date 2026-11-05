/**
 * A REFUSAL'S CALL STACK, READ THROUGH THE BUNDLER.
 *
 * On a phone, Hermes names the bundle in each frame (`http://host:8081/index.bundle?...:12:345`),
 * not the file the code came from, so no package can be read off it. The bundler that served the
 * bundle can map a frame back to its file: Metro and Expo both answer `POST /symbolicate`. Each
 * distinct stack is asked once; a bundler that cannot answer leaves the frames as the app sent them.
 */
import type { UnansweredRequest } from './readAppAnswer';

type Frame = { file: string; lineNumber: number; column: number; methodName?: string };

const ASK_TIMEOUT_MS = 3000;
const BUNDLE_FRAME = /^\s*(?:at\s+)?(?:(.*?)\s*[(@])?(https?:\/\/[^\s()]+?):(\d+):(\d+)\)?\s*$/;

/** The frame a stack line names in a bundle; nothing when the line names none. */
function bundleFrameOf(line: string): Frame | undefined {
  const found = BUNDLE_FRAME.exec(line);
  if (!found) return undefined;
  return {
    methodName: found[1] || undefined,
    file: found[2],
    lineNumber: Number(found[3]),
    column: Number(found[4]),
  };
}

async function symbolicated(stack: string, port: number): Promise<string> {
  const lines = stack.split('\n');
  const frames = lines.flatMap((line) => bundleFrameOf(line) ?? []);
  if (frames.length === 0) return stack;
  try {
    const reply = await fetch(`http://localhost:${port}/symbolicate`, {
      method: 'POST',
      body: JSON.stringify({ stack: frames }),
      signal: AbortSignal.timeout(ASK_TIMEOUT_MS),
    });
    if (!reply.ok) return stack;
    const { stack: mapped } = (await reply.json()) as { stack?: Frame[] };
    if (!Array.isArray(mapped) || mapped.length !== frames.length) return stack;
    let next = 0;
    return lines
      .map((line) => {
        if (!bundleFrameOf(line)) return line;
        const { methodName, file, lineNumber, column } = mapped[next++];
        return `at ${methodName ?? '<anonymous>'} (${file}:${lineNumber}:${column})`;
      })
      .join('\n');
  } catch {
    // The bundler is gone or slow: the stack stays as the app sent it, and the sender is named another way.
    return stack;
  }
}

/**
 * The same answer with each refusal's stack, and the line where its fake was declared, read through
 * the bundler on `port` in one call per refusal.
 */
export async function symbolicateStacks<Answer extends { unanswered?: UnansweredRequest[] }>(
  answer: Answer,
  port: number
): Promise<Answer> {
  if (!answer.unanswered?.some(({ stack, fakeAt }) => stack || fakeAt)) return answer;
  const asked = new Map<string, Promise<string>>();
  const unanswered = await Promise.all(
    answer.unanswered.map(async (request) => {
      if (!request.stack && !request.fakeAt) return request;
      // The fake's line goes first, the stack after it: one text, one question, split again below.
      const text = `${request.fakeAt ?? ''}\n${request.stack ?? ''}`;
      if (!asked.has(text)) asked.set(text, symbolicated(text, port));
      const [fakeAt, ...stack] = (await asked.get(text))!.split('\n');
      return {
        ...request,
        ...(request.fakeAt && { fakeAt }),
        ...(request.stack && { stack: stack.join('\n') }),
      };
    })
  );
  return { ...answer, unanswered };
}
