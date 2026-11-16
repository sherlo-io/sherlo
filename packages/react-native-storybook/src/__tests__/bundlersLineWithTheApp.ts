/**
 * A bundler's line on loopback with the app on it, for the tests of the launch entry: a socket
 * that says hello and stands in for the app's native connection, so what the line says to the app
 * reaches the SDK, and the SDK's messages are carried to the line one at a time.
 */
import * as http from 'http';
import type { AddressInfo } from 'net';
import { __emitMessageFromTheConnection, __getSentMessages } from './__mocks__/react-native';
import type { SherloLine } from '../../metro/sherloLine';

const { attach, LINE_PATH, PROTOCOL_VERSION } = require('../../metro/sherloLine.js');
const ws = require('ws');

export async function aBundlersLineWithTheAppOnIt() {
  const server = http.createServer();
  const line: SherloLine = attach(server, ws.WebSocketServer || ws.Server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const heardWaiters: Array<() => void> = [];
  const appIsOnTheLine = new Promise<void>((resolve) =>
    line.onApp((app) => {
      app.onMessage(() => heardWaiters.splice(0).forEach((heard) => heard()));
      resolve();
    })
  );

  const port = (server.address() as AddressInfo).port;
  const socket = new ws(`ws://127.0.0.1:${port}${LINE_PATH}`);
  await new Promise((resolve) => socket.once('open', resolve));
  socket.on('message', (data: unknown) => __emitMessageFromTheConnection(JSON.parse(String(data))));
  const hello = { protocolVersion: PROTOCOL_VERSION, nativeVersion: '3.0.0', jsVersion: '3.0.0' };

  /** Send one message to the line as the app, and resolve once the line has heard it. */
  function sayAsTheApp(message: Record<string, unknown>): Promise<void> {
    const heard = new Promise<void>((resolve) => heardWaiters.push(resolve));
    socket.send(JSON.stringify(message));
    return heard;
  }
  socket.send(JSON.stringify({ action: 'hello', ...hello }));
  await appIsOnTheLine;

  return {
    ask: line.ask,
    /** Carry the SDK's latest message to the line, as native code does. */
    carryTheAppsLatestMessage: () => sayAsTheApp(__getSentMessages().slice(-1)[0]),
    close: () => {
      socket.terminate();
      server.close();
    },
  };
}
