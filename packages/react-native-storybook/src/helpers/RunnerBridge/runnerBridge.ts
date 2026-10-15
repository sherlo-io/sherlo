import { onMessage, send as sendOverTheLine } from '../../connection/appLine';
import { log } from './actions';
import type { LogFn, ScrollMessage, StoryMessage } from '../../sealedCore/seam';
import type { AppProtocolItem } from './types';

export type RunnerBridge = {
  log: LogFn;
  send: (protocolItem: AppProtocolItem) => Promise<ScrollMessage | StoryMessage>;
};

/**
 * Send one message over the connection and resolve with what the runner answers about the story: a
 * scroll to its next part, or the next story. Native code acts on a story itself, by reloading the
 * JavaScript, so a promise for a story often never lives to resolve.
 */
function send(protocolItem: AppProtocolItem): Promise<ScrollMessage | StoryMessage> {
  return new Promise((resolve) => {
    // Listen before sending, so an answer that comes back at once is not missed.
    const stopListening = onMessage((message) => {
      if (message.action !== 'story' && message.action !== 'scroll') return;
      stopListening();
      resolve(message);
    });
    sendOverTheLine(protocolItem);
  });
}

const runnerBridge: RunnerBridge = { log, send };

export default runnerBridge;
