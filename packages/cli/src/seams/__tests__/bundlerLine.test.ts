/**
 * THE BUNDLER'S LINE, asked more than once - `bundlerLine.ts` asks the line on a bundler whose HTTP
 * server closes a connection it was kept open on. A question asked after that must still get through.
 */
import http from 'http';
import type { AddressInfo } from 'net';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import { LINE_PATH, PROTOCOL_VERSION } from '../../../../react-native-storybook/metro/sherloLine';
import { askTheBundlerLine } from '../bundlerLine';

let server: http.Server | undefined;

afterEach(async () => {
  const closing = server;
  server = undefined;
  await new Promise((resolve) => (closing ? closing.close(resolve) : resolve(undefined)));
});

/**
 * A bundler that answers the line's GET and WebSocket, and whose HTTP server has closed a kept-open
 * connection by the time a second question comes down it: the question crosses the close on the wire,
 * and meets a reset. A question on a connection of its own never meets it.
 */
async function startABundlerThatClosesIdleConnections(): Promise<number> {
  const answered = new WeakSet<object>();
  const bundler = http.createServer((request, response) => {
    if (answered.has(request.socket)) {
      // Node 18.3+ has resetAndDestroy; the installed typings do not know it yet.
      (request.socket as unknown as { resetAndDestroy: () => void }).resetAndDestroy();
      return;
    }
    answered.add(request.socket);
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('Keep-Alive', 'timeout=60');
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ protocolVersion: PROTOCOL_VERSION }));
  });
  server = bundler;
  const sockets = new WebSocketServer({ server: bundler, path: LINE_PATH });
  sockets.on('connection', (socket) => {
    socket.on('message', (data) => {
      const { askId } = JSON.parse(data.toString()) as { askId: string };
      socket.send(JSON.stringify({ action: 'reply', askId, reply: { kind: 'no-app' } }));
    });
  });
  await new Promise<void>((resolve) => bundler.listen(0, resolve));
  return (bundler.address() as AddressInfo).port;
}

describe('asking the bundler line', () => {
  it('a question asked after the bundler closed an idle connection still reaches the line', async () => {
    const port = await startABundlerThatClosesIdleConnections();
    const question = { action: 'whatIsOnScreen' } as const;

    const first = await askTheBundlerLine({ port, question, patienceMs: 3000 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const second = await askTheBundlerLine({ port, question, patienceMs: 3000 });

    expect(first).toEqual({ kind: 'said', reply: { kind: 'no-app' } });
    expect(second).toEqual({ kind: 'said', reply: { kind: 'no-app' } });
  });
});
