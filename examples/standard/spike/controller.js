// Spike bundle-reload: a WebSocket server that drives the app (spike/bundleReload.ts) through
// reloads and kills, and measures both from the host side.
// Usage: node spike/controller.js ios <simulator-udid> | android
// Writes spike/results-<platform>.json and prints a summary.
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const platform = process.argv[2];
const udid = process.argv[3];
const PORT = 8765;
const APP = 'io.sherlo.example.standard';
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const TIMING_RUNS = 10;
const MEMORY_RELOADS = 50;

const now = () => performance.now();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (...parts) => console.log(new Date().toISOString(), ...parts);

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

const device =
  platform === 'ios'
    ? {
        kill: () => {
          try {
            run('xcrun', ['simctl', 'terminate', udid, APP]);
          } catch {}
        },
        launch: () => run('xcrun', ['simctl', 'launch', udid, APP]),
        hostMemory: () => null,
      }
    : {
        kill: () => run('adb', ['shell', 'am', 'force-stop', APP]),
        launch: () => run('adb', ['shell', 'am', 'start', '-n', `${APP}/.MainActivity`]),
        hostMemory: () => {
          const text = run('adb', ['shell', 'dumpsys', 'meminfo', APP]);
          const pss = /TOTAL PSS:\s+(\d+)/.exec(text) || /TOTAL\s+(\d+)/.exec(text);
          const rss = /TOTAL RSS:\s+(\d+)/.exec(text);
          return { pssKb: pss ? Number(pss[1]) : null, rssKb: rss ? Number(rss[1]) : null };
        },
      };

// ---- a minimal WebSocket server (text frames only) ----
let appSocket = null;
let connections = 0;
const events = [];
const waiters = [];

function encodeText(text) {
  const payload = Buffer.from(text, 'utf8');
  const header = payload.length < 126 ? Buffer.from([0x81, payload.length]) : Buffer.from([0x81, 126, payload.length >> 8, payload.length & 0xff]);
  return Buffer.concat([header, payload]);
}

function sendToApp(text) {
  if (!appSocket) throw new Error('no app connected');
  appSocket.write(encodeText(text));
}

function onEvent(event) {
  events.push(event);
  for (const waiter of [...waiters]) {
    if (waiter.match(event)) {
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve(event);
    }
  }
}

// Generous: the first launch after an install on a 1-core emulator took over 30 s.
function waitFor(type, after, extra = () => true, timeoutMs = 120000) {
  const found = events.find((event) => event.type === type && event.at >= after && extra(event));
  if (found) return Promise.resolve(found);
  return new Promise((resolve, reject) => {
    const waiter = { match: (event) => event.type === type && event.at >= after && extra(event), resolve };
    waiters.push(waiter);
    setTimeout(() => {
      if (waiters.includes(waiter)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        reject(new Error(`timeout waiting for ${type}`));
      }
    }, timeoutMs);
  });
}

const server = http.createServer((request, response) => response.end('spike controller\n'));
server.on('upgrade', (request, socket) => {
  const accept = crypto.createHash('sha1').update(request.headers['sec-websocket-key'] + GUID).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);
  connections += 1;
  const connection = connections;
  appSocket = socket;
  log(`OPEN connection ${connection}`);
  let buffered = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buffered = Buffer.concat([buffered, chunk]);
    for (;;) {
      if (buffered.length < 2) return;
      const opcode = buffered[0] & 0x0f;
      const masked = (buffered[1] & 0x80) !== 0;
      let length = buffered[1] & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (buffered.length < 4) return;
        length = buffered.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buffered.length < 10) return;
        length = Number(buffered.readBigUInt64BE(2));
        offset = 10;
      }
      const maskLength = masked ? 4 : 0;
      if (buffered.length < offset + maskLength + length) return;
      const payload = Buffer.from(buffered.subarray(offset + maskLength, offset + maskLength + length));
      if (masked) {
        const mask = buffered.subarray(offset, offset + 4);
        for (let index = 0; index < payload.length; index++) payload[index] ^= mask[index & 3];
      }
      buffered = buffered.subarray(offset + maskLength + length);
      if (opcode === 0x8) {
        socket.end();
        return;
      }
      if (opcode === 0x9) {
        socket.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload]));
        continue;
      }
      if (opcode !== 0x1) continue;
      const text = payload.toString('utf8');
      if (!text.startsWith('EVT ')) continue;
      // `serverConnection` numbers the TCP connection on this side; a reused socket keeps its number.
      const event = { ...JSON.parse(text.slice(4)), at: now(), serverConnection: connection };
      if (event.type !== 'RENDERED') log(`${event.type} ctx=${event.ctx} conn=${connection}`);
      onEvent(event);
    }
  });
  socket.on('close', () => log(`GONE connection ${connection}`));
  socket.on('error', (error) => log(`ERROR connection ${connection} ${error.message}`));
});

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return Math.round(value * 10) / 10;
}

async function lateProbe() {
  await sleep(4000);
  const asked = now();
  sendToApp('PROBE');
  return waitFor('PROBE', asked, (event) => event.when === 'late');
}

async function reloadOnce() {
  const asked = now();
  sendToApp('RELOAD');
  const rendered = await waitFor('RENDERED', asked);
  const ready = await waitFor('READY', asked);
  const hello = await waitFor('HELLO', asked);
  return { ms: rendered.at - asked, rendered, ready, hello };
}

async function killOnce() {
  const asked = now();
  device.kill();
  device.launch();
  const rendered = await waitFor('RENDERED', asked);
  const ready = await waitFor('READY', asked);
  const hello = await waitFor('HELLO', asked);
  return { ms: rendered.at - asked, rendered, ready, hello };
}

async function main() {
  await new Promise((resolve) => server.listen(PORT, '0.0.0.0', resolve));
  log(`listening on ${PORT} for ${platform}`);
  if (platform === 'android') run('adb', ['reverse', `tcp:${PORT}`, `tcp:${PORT}`]);
  const results = { platform, startedAt: new Date().toISOString() };

  // 1. A fresh process, settled.
  const first = await killOnce();
  results.fresh = { hello: first.hello, early: await waitFor('PROBE', 0, (event) => event.when === 'early') };
  results.fresh.late = await lateProbe();

  // 2. Isolation across a reload: state was set in ctx N; what does ctx N+1 see?
  const reloaded = await reloadOnce();
  results.reloadIsolation = {
    hello: reloaded.hello,
    early: await waitFor('PROBE', reloaded.hello.at - 1, (event) => event.when === 'early' && event.ctx === reloaded.hello.ctx),
  };
  results.reloadIsolation.late = await lateProbe();

  // 3. Timing and memory across reloads.
  const reloads = [];
  results.memoryBefore = { app: reloaded.rendered.memory, host: device.hostMemory() };
  for (let index = 1; index <= MEMORY_RELOADS; index++) {
    await sleep(300);
    const outcome = await reloadOnce();
    const sample = {
      index,
      ms: Math.round(outcome.ms * 10) / 10,
      ctx: outcome.hello.ctx,
      pid: outcome.hello.started.pid,
      reusedSocket: outcome.hello.connection?.reused,
      serverConnection: outcome.hello.serverConnection,
      nativeMsSinceReloadRequest: outcome.rendered.nativeMsSinceReloadRequest,
      appMemory: outcome.rendered.memory,
    };
    if (index % 10 === 0) sample.hostMemory = device.hostMemory();
    reloads.push(sample);
    log(`reload ${index}: ${sample.ms} ms pid=${sample.pid} ctx=${sample.ctx} reused=${sample.reusedSocket}`);
  }
  results.reloads = reloads;
  results.afterReloadsLate = await lateProbe();

  // 4. Isolation across a kill.
  const killed = await killOnce();
  results.killIsolation = {
    hello: killed.hello,
    early: await waitFor('PROBE', killed.hello.at - 1, (event) => event.when === 'early'),
  };
  results.killIsolation.late = await lateProbe();

  // 5. Timing across kills.
  const kills = [];
  for (let index = 1; index <= TIMING_RUNS; index++) {
    await sleep(300);
    const outcome = await killOnce();
    kills.push({ index, ms: Math.round(outcome.ms * 10) / 10, pid: outcome.hello.started.pid, memory: outcome.rendered.memory });
    log(`kill ${index}: ${Math.round(outcome.ms)} ms pid=${outcome.hello.started.pid}`);
  }
  results.kills = kills;

  results.summary = {
    reloadMedianFirst10Ms: median(reloads.slice(0, TIMING_RUNS).map((sample) => sample.ms)),
    reloadMedianAll50Ms: median(reloads.map((sample) => sample.ms)),
    reloadInAppMedianMs: median(reloads.slice(0, TIMING_RUNS).map((sample) => sample.nativeMsSinceReloadRequest)),
    killMedianMs: median(kills.map((sample) => sample.ms)),
    pidsAcrossReloads: [...new Set(reloads.map((sample) => sample.pid))],
    socketReusedOnEveryReload: reloads.every((sample) => sample.reusedSocket === true),
    memoryBefore: results.memoryBefore,
    memoryEvery10: reloads.filter((sample) => sample.index % 10 === 0).map((sample) => ({ index: sample.index, app: sample.appMemory, host: sample.hostMemory })),
  };
  results.events = events.length;
  const file = path.join(__dirname, `results-${platform}.json`);
  fs.writeFileSync(file, JSON.stringify(results, null, 2));
  log('SUMMARY', JSON.stringify(results.summary, null, 2));
  log(`wrote ${file}`);
  process.exit(0);
}

main().catch((error) => {
  log('FAILED', error.stack);
  fs.writeFileSync(path.join(__dirname, `results-${platform}-partial.json`), JSON.stringify(events, null, 2));
  process.exit(1);
});
