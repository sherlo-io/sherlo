// Usage: node spike/probe.js <port> [--http-first]
// Connects to ws://localhost:<port>/sherlo/line, then checks Metro's own endpoints still answer.
const http = require('http');
const path = require('path');
const WebSocket = require(require.resolve('ws', { paths: [path.join(__dirname, '..', 'node_modules', 'metro')] }));

const port = Number(process.argv[2]);
const httpFirst = process.argv.includes('--http-first');

function get(p) {
  return new Promise((resolve, reject) => {
    http.get({ port, path: p, host: 'localhost' }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body: body.slice(0, 80) }));
    }).on('error', reject);
  });
}

// Opens a socket and reports the first message, or how it failed.
function open(p, sendThis) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${port}${p}`);
    const timer = setTimeout(() => { ws.terminate(); resolve({ path: p, result: 'timeout (open, no message)' }); }, 2500);
    const messages = [];
    ws.on('open', () => { if (sendThis) ws.send(sendThis); else if (!p.startsWith('/sherlo')) { clearTimeout(timer); ws.close(); resolve({ path: p, result: 'opened' }); } });
    ws.on('message', (m) => {
      messages.push(m.toString());
      if (!sendThis || messages.length === 2) { clearTimeout(timer); ws.close(); resolve({ path: p, result: messages }); }
    });
    ws.on('error', (e) => { clearTimeout(timer); resolve({ path: p, result: 'error: ' + e.message }); });
    ws.on('close', () => { clearTimeout(timer); resolve({ path: p, result: messages.length ? messages : 'closed' }); });
  });
}

// HMR really works: register an entry point and wait for Metro's own reply.
function hmr() {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${port}/hot`);
    const timer = setTimeout(() => { ws.terminate(); resolve('timeout'); }, 90000);
    const types = [];
    ws.on('open', () => ws.send(JSON.stringify({ type: 'register-entrypoints', entryPoints: [`http://localhost:${port}/index.bundle?platform=ios&dev=true&minify=false`] })));
    ws.on('message', (m) => {
      const t = JSON.parse(m.toString()).type;
      types.push(t);
      if (t === 'update-done' || t === 'bundle-registered') { clearTimeout(timer); ws.close(); resolve(types); }
    });
    ws.on('error', (e) => { clearTimeout(timer); resolve('error: ' + e.message); });
  });
}

(async () => {
  if (process.argv.includes('--deep')) {
    const bundle = await get('/index.bundle?platform=ios&dev=true&minify=false');
    console.log('GET /index.bundle (Metro bundles through our middleware)', bundle);
    console.log('WS /hot register-entrypoints ->', JSON.stringify(await hmr()));
  }
  if (httpFirst) console.log('GET /sherlo/line (http first)', await get('/sherlo/line'));
  console.log('WS /sherlo/line', JSON.stringify(await open('/sherlo/line', 'ping')));
  console.log('GET /status', await get('/status'));
  console.log('GET /json/version', await get('/json/version'));
  console.log('WS /hot', JSON.stringify(await open('/hot')));
  console.log('WS /message', JSON.stringify(await open('/message')));
  console.log('WS /events', JSON.stringify(await open('/events')));
  console.log('WS /inspector/debug (bad id, expect refusal)', JSON.stringify(await open('/inspector/debug?device=x&page=y')));
  console.log('WS /nope (expect destroyed)', JSON.stringify(await open('/nope')));
})();
