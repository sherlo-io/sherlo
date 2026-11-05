/**
 * THE REFUSING PROXY, standing on a real port: the requests an emulator sends through it are real
 * connections here, and the bundler is a real server on another port.
 */
import http from 'http';
import net from 'net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startRefusingProxy } from '../refusingProxy';
import type { RefusingProxy } from '../refusingProxy';

let bundler: http.Server;
let bundlerPort: number;
let proxy: RefusingProxy;

beforeEach(async () => {
  bundler = http.createServer((_request, response) => response.end('the bundle'));
  await new Promise<void>((resolve) => bundler.listen(0, '127.0.0.1', resolve));
  bundlerPort = (bundler.address() as net.AddressInfo).port;
  proxy = await startRefusingProxy(bundlerPort);
});

afterEach(async () => {
  await proxy.stop();
  await new Promise((resolve) => bundler.close(resolve));
});

/** One request sent to the proxy the way an HTTP client with a proxy sends it: the whole address as the path. */
function viaProxy(address: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port: proxy.port, path: address }, (response) => {
        let body = '';
        response.on('data', (chunk) => (body += chunk));
        response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
      })
      .on('error', reject);
  });
}

describe('the proxy that refuses what an emulator sends', () => {
  it("the proxy refuses every request but the bundler's, and reports its host with the proxy as its rule", async () => {
    const analytics = await viaProxy('http://analytics.example/ping?id=1');

    expect(analytics.status).toBe(403);
    expect(proxy.refused()).toEqual([
      {
        method: 'GET',
        url: 'http://analytics.example/ping?id=1',
        rule: 'emulator-proxy',
        scope: 'background',
      },
    ]);

    // The emulator reaches the machine's bundler as 10.0.2.2 or as the machine's own address.
    const bundled = await viaProxy(`http://127.0.0.1:${bundlerPort}/index.bundle`);
    expect(bundled).toEqual({ status: 200, body: 'the bundle' });
    // The same machine on another port is not the bundler.
    const other = await viaProxy(`http://127.0.0.1:${bundlerPort + 1}/index.bundle`);
    expect(other.status).toBe(403);
    expect(proxy.refused().map((request) => request.url)).toEqual([
      'http://analytics.example/ping?id=1',
      `http://127.0.0.1:${bundlerPort + 1}/index.bundle`,
    ]);
  });

  it('a secure connection asked for through the proxy is refused and its host reported', async () => {
    const answer = await new Promise<string>((resolve, reject) => {
      const socket = net.connect(proxy.port, '127.0.0.1', () => {
        socket.write('CONNECT crash.example:443 HTTP/1.1\r\nHost: crash.example:443\r\n\r\n');
      });
      socket.on('data', (chunk) => resolve(chunk.toString()));
      socket.on('error', reject);
    });

    expect(answer.startsWith('HTTP/1.1 403')).toBe(true);
    expect(proxy.refused()).toEqual([
      {
        method: 'CONNECT',
        url: 'https://crash.example',
        rule: 'emulator-proxy',
        scope: 'background',
      },
    ]);
  });

  it('a stopped proxy no longer listens', async () => {
    await proxy.stop();

    await expect(viaProxy('http://analytics.example/')).rejects.toThrow();
    proxy = await startRefusingProxy(bundlerPort);
  });
});
