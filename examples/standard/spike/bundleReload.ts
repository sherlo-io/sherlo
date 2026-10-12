// Spike bundle-reload: runs in every JS context the app starts, whether a launch or a reload.
// 1. Numbers the context and probes every place state could have survived from the last one.
// 2. Connects the native socket held in a static (reused when it survived), and reports.
// 3. Sets state in every one of those places, so the next context can look for it.
// The server (spike/controller.js) drives reloads and kills, and measures from its side.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image, Platform } from 'react-native';
import SpikeNet from '../modules/spike-net';

// Android reaches the host through `adb reverse tcp:8765 tcp:8765` (the controller sets it up):
// the emulator's 10.0.2.2 NAT dropped the held socket mid-run ("Software caused connection abort").
const SERVER = 'ws://127.0.0.1:8765/app';
const IMAGE = 'https://reactnative.dev/img/tiny_logo.png';
const STORAGE_KEY = 'spike-bundle-reload';
const PENDING_TIMEOUT_MS = 3000;

const started = SpikeNet.contextStarted();
const ctx: number = started.ctx;
const contextStartedAt = performance.now();

// Module-level state: set once this module has run, so a value from the last context shows up
// here only if the module was not evaluated afresh.
let moduleValue = 'unset';
let renderedReported = false;

function contextAgeMs() {
  return Math.round(performance.now() - contextStartedAt);
}

async function probe(when: string) {
  const [storage, cache] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEY).catch((error) => `error ${error}`),
    Image.queryCache?.([IMAGE]).catch((error) => ({ error: String(error) })),
  ]);
  return {
    when,
    ctx,
    contextAgeMs: contextAgeMs(),
    jsGlobal: (globalThis as any).__spikeGlobal ?? null,
    moduleValue,
    asyncStorage: storage,
    imageCache: cache?.[IMAGE] ?? cache ?? null,
    native: SpikeNet.nativeState(),
    memory: SpikeNet.memory(),
  };
}

const connected = SpikeNet.connect(SERVER);

function send(type: string, body: object) {
  return connected
    .then(() => SpikeNet.send(`EVT ${JSON.stringify({ type, ctx, ...body })}`))
    .catch((error) => SpikeNet.log(`send ${type} failed: ${error}`));
}

function setEverything() {
  const tag = `ctx${ctx}`;
  (globalThis as any).__spikeGlobal = tag;
  moduleValue = tag;
  SpikeNet.setStatic('lastContext', tag);
  SpikeNet.setInstance(tag);
  setInterval(() => SpikeNet.tick(`interval:${ctx}`), 200);
  setTimeout(() => SpikeNet.tick(`timeout:${ctx}`), PENDING_TIMEOUT_MS);
  SpikeNet.addListener('onMessage', ({ text }) => {
    SpikeNet.tick(`listener:${ctx}`);
    if (text === 'PROBE') probe('late').then((result) => send('PROBE', result));
  });
  return AsyncStorage.setItem(STORAGE_KEY, tag);
}

export function reportStoryRendered() {
  if (renderedReported) return;
  renderedReported = true;
  const sinceReload = SpikeNet.nativeState().msSinceReloadRequest;
  send('RENDERED', { contextAgeMs: contextAgeMs(), nativeMsSinceReloadRequest: sinceReload, memory: SpikeNet.memory() });
}

export async function runSpike() {
  const early = await probe('early');
  const connection = await connected.catch((error) => ({ error: String(error) }));
  await send('HELLO', { started, connection, platform: Platform.OS });
  await send('PROBE', early);
  await setEverything();
  const prefetched = await Image.prefetch(IMAGE).catch((error) => `error ${error}`);
  await send('READY', { prefetched });
}
