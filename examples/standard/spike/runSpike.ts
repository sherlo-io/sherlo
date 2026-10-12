// Spike release-connection: runs the transport matrix at launch, then the SDK's own restart, and
// reports both to the device log (tag SpikeNet) and, where a connection works, to spike/server.js.
import { Platform } from 'react-native';
import { openStorybook } from '@sherlo/react-native-storybook';
import SpikeNet from '../modules/spike-net';

const SMALL = 'x'.repeat(100);
const BIG = 'y'.repeat(2 * 1024 * 1024);
const SMALL_ROUNDS = 20;
const BIG_ROUNDS = 5;

type Client = {
  open(url: string): Promise<number>;
  echo(text: string): Promise<{ length: number; nativeMs: number }>;
  close(): void;
};

function nativeClient(kind: string): Client {
  return {
    open: (url) => SpikeNet.open(kind, url),
    echo: (text) => SpikeNet.echo(text),
    close: () => SpikeNet.close(),
  };
}

function jsClient(): Client {
  let socket: WebSocket | null = null;
  let waiting: ((value: string) => void) | null = null;
  let failing: ((error: Error) => void) | null = null;
  return {
    open: (url) =>
      new Promise((resolve, reject) => {
        const started = performance.now();
        socket = new WebSocket(url);
        socket.onopen = () => resolve(performance.now() - started);
        // React Native dispatches a bare 'error' event, then a 'close' event whose reason
        // carries the native message (Libraries/WebSocket/WebSocket.js, websocketFailed).
        socket.onclose = (event: any) => {
          const error = new Error(`JS WebSocket closed code=${event?.code} reason=${event?.reason}`);
          reject(error);
          failing?.(error);
        };
        socket.onmessage = (event: any) => waiting?.(String(event.data));
      }),
    echo: (text) =>
      new Promise((resolve, reject) => {
        const started = performance.now();
        waiting = (reply) => resolve({ length: reply.length, nativeMs: performance.now() - started });
        failing = reject;
        socket!.send(text);
      }),
    close: () => socket?.close(),
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms} ms: ${what}`)), ms)),
  ]);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.floor(sorted.length / 2)] * 100) / 100;
}

async function measure(kind: string, url: string) {
  const client = kind === 'js' ? jsClient() : nativeClient(kind);
  try {
    const openMs = await withTimeout(client.open(url), 15000, 'open');
    await withTimeout(client.echo(`hello ${url}`), 5000, 'hello');
    const smallTotal: number[] = [];
    const smallNative: number[] = [];
    for (let round = 0; round < SMALL_ROUNDS; round++) {
      const started = performance.now();
      const reply = await withTimeout(client.echo(SMALL), 5000, 'small echo');
      smallTotal.push(performance.now() - started);
      smallNative.push(reply.nativeMs);
    }
    const bigTotal: number[] = [];
    const bigNative: number[] = [];
    for (let round = 0; round < BIG_ROUNDS; round++) {
      const started = performance.now();
      const reply = await withTimeout(client.echo(BIG), 30000, 'big echo');
      if (reply.length !== BIG.length) throw new Error(`big echo came back ${reply.length} bytes`);
      bigTotal.push(performance.now() - started);
      bigNative.push(reply.nativeMs);
    }
    const result = {
      cell: `${Platform.OS} ${kind} ${url}`,
      ok: true,
      openMs: Math.round(openMs * 100) / 100,
      smallMedianMs: median(smallTotal),
      smallMedianNativeMs: median(smallNative),
      bigMedianMs: median(bigTotal),
      bigMedianNativeMs: median(bigNative),
    };
    await client.echo(`RESULT ${JSON.stringify(result)}`).catch(() => {});
    return result;
  } catch (error: any) {
    return { cell: `${Platform.OS} ${kind} ${url}`, ok: false, error: String(error?.message ?? error) };
  } finally {
    client.close();
  }
}

// Plain HTTP GET through React Native's fetch (URLSession on iOS, OkHttp on Android).
async function measureFetch(url: string) {
  try {
    const timings: number[] = [];
    for (let round = 0; round < 5; round++) {
      const started = performance.now();
      const response = await withTimeout(fetch(url), 10000, 'fetch');
      await response.text();
      timings.push(performance.now() - started);
    }
    return { cell: `${Platform.OS} fetch ${url}`, ok: true, medianMs: median(timings) };
  } catch (error: any) {
    return { cell: `${Platform.OS} fetch ${url}`, ok: false, error: String(error?.message ?? error) };
  }
}

function log(line: string) {
  SpikeNet.log(line);
  console.log(`SpikeNet ${line}`);
}

const TARGETS =
  Platform.OS === 'ios'
    ? { hosts: ['ws://localhost:8765', 'ws://127.0.0.1:8765'], kinds: ['nw', 'urlsession', 'js'], native: 'nw' }
    : { hosts: ['ws://10.0.2.2:8765', 'ws://localhost:8766'], kinds: ['raw', 'okhttp', 'js'], native: 'raw' };

async function report(address: string, line: string) {
  try {
    await SpikeNet.open(TARGETS.native, `${address}/report`);
    await SpikeNet.echo(`LOG ${line}`);
  } catch (error: any) {
    log(`report to ${address} failed: ${error?.message ?? error}`);
  } finally {
    SpikeNet.close();
  }
}

export async function runSpike() {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const info = SpikeNet.launchInfo();
  const fallback = TARGETS.hosts[0];
  const address = typeof info.sherloAddress === 'string' ? info.sherloAddress : fallback;
  const afterRestart = Number(info.msSinceRestartMark) >= 0;
  log(`LAUNCH ${afterRestart ? 'after-restart' : 'fresh'} ${JSON.stringify(info)}`);

  if (afterRestart) {
    await report(address, `RESTART-CHECK ${JSON.stringify(info)}`);
    return;
  }

  await report(address, `LAUNCH ${JSON.stringify(info)}`);
  for (const host of TARGETS.hosts) {
    for (const kind of TARGETS.kinds) {
      const label = `${host}/${Platform.OS}-${kind}-${host.replace(/^ws:\/\//, '').replace(/[:.]/g, '_')}`;
      const result = await measure(kind, label);
      log(`RESULT ${JSON.stringify(result)}`);
      if (!result.ok) await report(address, `FAILED ${JSON.stringify(result)}`);
    }
    const fetchResult = await measureFetch(`${host.replace(/^ws:/, 'http:')}/fetch`);
    log(`RESULT ${JSON.stringify(fetchResult)}`);
    await report(address, `FETCH ${JSON.stringify(fetchResult)}`);
  }
  // Control: a public cleartext host, which App Transport Security / the cleartext policy refuse.
  const controlResult = await measureFetch('http://neverssl.com/');
  log(`RESULT ${JSON.stringify(controlResult)}`);
  await report(address, `CONTROL ${JSON.stringify(controlResult)}`);

  log('RESTART via the SDK openStorybook()');
  await report(address, `RESTARTING pid=${info.pid}`);
  SpikeNet.markRestart();
  openStorybook();
}
