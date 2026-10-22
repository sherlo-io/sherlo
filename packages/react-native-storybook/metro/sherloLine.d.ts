/**
 * The types of ./sherloLine.js, the server half of the app's connection. Every message shape comes
 * from the seam; what is declared here is only how those shapes travel to and from the line.
 */
import type {
  BundlerLetterbox,
  CaptureInstruction,
  CaptureSettings,
  CaptureTransport,
  CapturedAnswer,
  HelloMessage,
  LetterboxAnswer,
  MessageFromTheApp,
  MessageToTheApp,
  StoryThrew,
} from '../src/sealedCore/seam';

/** Where the line is mounted, on the server's own port. */
export declare const LINE_PATH: '/sherlo/line';

/** The version of the message set the line speaks; the seam's SHERLO_PROTOCOL_VERSION is equal. */
export declare const PROTOCOL_VERSION: number;

/* ---- What the app says to the bundler's relays, and what they answer ------------------------- */

/** `sherlo open`'s road: the app's BundlerLetterbox wait, over the line. */
export type WaitForStoryMessage = { action: 'waitForStory' } & Parameters<
  BundlerLetterbox['waitForStory']
>[0];

/** The letterbox's answer to a WaitForStoryMessage. */
export type LetterboxAnswerMessage = { action: 'letterboxAnswer' } & LetterboxAnswer;

/** `sherlo capture`'s road: the app's CaptureTransport wait, over the line. */
export type WaitForACaptureMessage = { action: 'waitForACapture' } & Parameters<
  CaptureTransport['waitForACapture']
>[0];

/** The capture relay's answer to a WaitForACaptureMessage. */
export type CaptureInstructionMessage = { action: 'captureInstruction' } & CaptureInstruction;

/**
 * The app's JavaScript died as it started, before Sherlo's Storybook drew: what it threw. The
 * polyfill (./polyfill.js) sends it, once per run of the JavaScript; the capture relay answers a
 * capture of that app `crashed` with it.
 */
export type StartFailedMessage = { action: 'start-failed' } & StoryThrew;

/** Every message an app sends the line: the seam's, its waits on the bundler's relays, and its start error. */
export type MessageFromTheAppToTheLine =
  | MessageFromTheApp
  | WaitForStoryMessage
  | WaitForACaptureMessage
  | StartFailedMessage;

/** Every message the line sends an app: the seam's, and the bundler's relays' answers. */
export type MessageFromTheLineToTheApp =
  | MessageToTheApp
  | LetterboxAnswerMessage
  | CaptureInstructionMessage;

/* ---- A driver's questions, and their replies ------------------------------------------------- */

/** `sherlo open`: show this story, and with `wait`, say when it is drawn. */
export type OpenStoryQuestion = {
  action: 'openStory';
  storyId: string;
  wait?: boolean;
  /** How long `wait` waits for the app to draw the story; 30 when not said. */
  timeoutSeconds?: number;
};

export type OpenStoryReply =
  | { kind: 'no-app' }
  | { kind: 'no-such-story'; known: string[] }
  | {
      kind: 'handed-over';
      storyId: string;
      rendered: 'yes' | 'timed-out' | 'not-waited';
      /** What the story threw while it was drawn; absent when it drew cleanly. */
      threw?: StoryThrew;
    };

/** Which story is on screen. */
export type WhatIsOnScreenQuestion = { action: 'whatIsOnScreen' };

export type WhatIsOnScreenReply =
  | { kind: 'no-app' }
  | { kind: 'not-at-story-browser' }
  | { kind: 'showing'; storyId: string };

/** `sherlo capture`: walk this story with these numbers, and answer with its record. */
export type CaptureStoryQuestion = {
  action: 'captureStory';
  storyId: string;
  settings?: CaptureSettings;
};

export type CaptureStoryReply =
  | CapturedAnswer
  | { kind: 'no-app' }
  | {
      kind: 'no-such-story';
      known: string[];
      /** The story files that threw as the app loaded them; absent when none did. */
      brokenFiles?: { file: string; error: { name: string; message: string } }[];
    };

/** Every log line the apps sent since the last read; the read empties the feed. */
export type ReadLogLinesQuestion = { action: 'readLogLines' };

export type ReadLogLinesReply = { lines: string[] };

export type Question =
  | OpenStoryQuestion
  | WhatIsOnScreenQuestion
  | CaptureStoryQuestion
  | ReadLogLinesQuestion;

export type ReplyTo<AskedQuestion extends Question> = AskedQuestion extends OpenStoryQuestion
  ? OpenStoryReply
  : AskedQuestion extends WhatIsOnScreenQuestion
  ? WhatIsOnScreenReply
  : AskedQuestion extends CaptureStoryQuestion
  ? CaptureStoryReply
  : ReadLogLinesReply;

/**
 * A question asked over a driver's own socket. `askId` is the driver's own name for it, said back
 * with the reply.
 */
export type QuestionMessage = Question & { askId?: string };

/** The reply to a QuestionMessage, on the socket that asked it. */
export type ReplyMessage = {
  action: 'reply';
  askId?: string;
  reply: OpenStoryReply | WhatIsOnScreenReply | CaptureStoryReply | ReadLogLinesReply;
};

/* ---- The line ------------------------------------------------------------------------------- */

/** An app that said hello in the line's protocol. */
export type AppOnTheLine = {
  hello: HelloMessage;
  send: (message: MessageFromTheLineToTheApp) => void;
  /** Hear every message the app sends after its hello. */
  onMessage: (listener: (message: MessageFromTheAppToTheLine) => void) => void;
  /** Hear the app's socket close. */
  onClose: (listener: () => void) => void;
  close: () => void;
};

export type SherloLine = {
  /** A driver in the same process: ask, and get the reply a driver's socket would. */
  ask: <AskedQuestion extends Question>(question: AskedQuestion) => Promise<ReplyTo<AskedQuestion>>;
  /** Hear of each app that says hello in the line's protocol. */
  onApp: (listener: (app: AppOnTheLine) => void) => void;
  /** Close every socket on the line. */
  close: () => void;
};

/** As much of Node's http.Server as the line uses. */
export type ServerTakingUpgrades = {
  listeners: (event: 'upgrade') => Function[];
  removeAllListeners: (event: 'upgrade') => unknown;
  on: (event: 'upgrade' | 'close', listener: (...args: any[]) => void) => unknown;
};

/** As much of `ws`'s WebSocketServer class as the line uses. */
export type WebSocketServerClass = new (options: { noServer: true }) => {
  on: (event: 'connection', listener: (webSocket: any) => void) => unknown;
  // `any`: the line requires nothing, so it cannot name `ws`'s or Node's types for these three.
  handleUpgrade: (
    request: any,
    socket: any,
    head: any,
    whenUpgraded: (webSocket: any) => void
  ) => void;
  emit: (event: 'connection', webSocket: any, request: unknown) => boolean;
  clients: Set<{ terminate: () => void }>;
  close: () => void;
};

/**
 * Mount the line on `httpServer`: take every WebSocket upgrade for LINE_PATH, and hand every other
 * upgrade to the listeners the server had before.
 */
export declare function attach(
  httpServer: ServerTakingUpgrades,
  WebSocketServer: WebSocketServerClass,
  settings?: {
    /** How long an app's wait is held before it is answered with nothing; 20 seconds. */
    appHoldMs?: number;
    /** Told why each refused hello was refused. */
    warn?: (message: string) => void;
    /**
     * Whether any story file the bundle's Storybook loads was modified after `time` (milliseconds
     * since 1970). Asked once per capture, never on a timer.
     */
    storyFileChangedSince?: (time: number) => boolean;
  }
): SherloLine;

/** Why the line refuses this `hello`, in words naming both versions, or null when it speaks it. */
export declare function refusalOfHello(hello: { protocolVersion?: unknown }): string | null;
