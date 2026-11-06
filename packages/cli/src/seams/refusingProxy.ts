/**
 * THE REFUSING PROXY - what stops an Android emulator's native clients (analytics, crash and image
 * libraries that bypass fetch and XMLHttpRequest) from reaching the real network during a scene.
 *
 * It listens on this computer's loopback and refuses every request but the app's own development
 * traffic (the bundler's, and React DevTools' port): the emulator
 * is told to use it as its global proxy ({@link ./deviceState}), and 10.0.2.2 is this computer to
 * the emulator. Each request it refuses is listed with its address and the rule `emulator-proxy`,
 * the same record the app's own refusals are (the SDK's `RefusedRequest`).
 *
 * Setting and putting back the emulator's proxy is a phone setting like the others, saved and
 * restored with them (./deviceStateSave, ./deviceStateRestore); this file only runs the proxy.
 * iOS needs no proxy.
 *
 * It sees a secure connection (CONNECT) only as the host it is asked to reach, so that is all it
 * lists of one; a plain request is listed with its whole address, as the app's own refusals are.
 */
import http from 'http';
import net from 'net';
import { isReactDevToolsAddress } from '../../../react-native-storybook/src/developmentTraffic';
import type { RefusedRequest } from '../../../react-native-storybook/src/mocking/refusedRequest';

export type RefusingProxy = {
  /** The loopback port it listens on. */
  port: number;
  /** Every request refused so far, in the order made. */
  refused(): RefusedRequest[];
  stop(): Promise<void>;
};

/** The proxy a scene is running behind, until it is stopped. */
let blocking: RefusingProxy | undefined;

/** What the proxy has refused during the scene now running; nothing when none runs behind one. */
export function refusedByTheProxy(): RefusedRequest[] {
  return blocking?.refused() ?? [];
}

/** What the emulator calls this computer, and the names this computer is known by. */
const THIS_COMPUTER = ['10.0.2.2', 'localhost', '127.0.0.1'];

/** Listen on a free loopback port, answering only for the bundler on `bundlerPort`. */
export async function startRefusingProxy(bundlerPort: number): Promise<RefusingProxy> {
  const refused: RefusedRequest[] = [];
  const sockets = new Set<net.Socket>();

  const refuse = (method: string, url: string): void => {
    refused.push({ method, url, rule: 'emulator-proxy', scope: 'background' });
  };
  const addressOf = (target: string | undefined): URL | undefined => {
    try {
      return new URL(target ?? '');
    } catch {
      // A request that names no address (not sent through a proxy) is not the bundler's.
      return undefined;
    }
  };
  // The app's own development traffic: the bundler's port, or React DevTools' (developmentTraffic.ts).
  const isOwnTraffic = (address: URL | undefined): address is URL =>
    address !== undefined &&
    THIS_COMPUTER.includes(address.hostname) &&
    (Number(address.port) === bundlerPort ||
      isReactDevToolsAddress(address.hostname, Number(address.port)));

  const server = http.createServer((request, response) => {
    const address = addressOf(request.url);
    if (!isOwnTraffic(address)) {
      refuse(request.method ?? 'GET', request.url ?? '');
      response.writeHead(403, { 'content-type': 'text/plain' });
      response.end('Sherlo refused this request: no real request leaves the phone during a scene.');
      return;
    }
    const forwarded = http.request(
      {
        host: '127.0.0.1',
        port: Number(address.port),
        path: address.pathname + address.search,
        method: request.method,
        headers: request.headers,
        // One connection for this request, so none is left open to the bundler when it ends.
        agent: false,
      },
      (answer) => {
        response.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(response);
      }
    );
    forwarded.on('error', () => {
      response.writeHead(502).end();
    });
    request.pipe(forwarded);
  });

  // A secure connection is never the bundler's (the bundler speaks plain HTTP).
  server.on('connect', (request, socket) => {
    refuse('CONNECT', `https://${(request.url ?? '').replace(/:\d+$/, '')}`);
    socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
  });

  // The bundler's live sockets (hot reload) arrive as upgrades: tunnel them to the bundler.
  server.on('upgrade', (request, socket, head) => {
    const address = addressOf(request.url);
    if (!isOwnTraffic(address)) {
      refuse(request.method ?? 'GET', request.url ?? '');
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    const upstream = net.connect(Number(address.port), '127.0.0.1', () => {
      const headers = request.rawHeaders.reduce(
        (lines, word, index) =>
          index % 2 === 0 ? [...lines, word] : [...lines.slice(0, -1), `${lines.at(-1)}: ${word}`],
        [] as string[]
      );
      upstream.write(
        [
          `${request.method} ${address.pathname}${address.search} HTTP/1.1`,
          ...headers,
          '',
          '',
        ].join('\r\n')
      );
      upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const proxy: RefusingProxy = {
    port: (server.address() as net.AddressInfo).port,
    refused: () => [...refused],
    stop: () =>
      new Promise<void>((resolve) => {
        if (blocking === proxy) blocking = undefined;
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
  blocking = proxy;
  return proxy;
}
