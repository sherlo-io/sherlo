// Spike release-connection: a tiny WebSocket echo server, hand-rolled on Node's http upgrade.
// Every client message is echoed back unchanged. Text messages starting with "RESULT " or "LOG "
// are printed, so a client can report its own measurements over the same connection.
// Usage: node spike/server.js [port]   (default 8765, listens on all interfaces)
const http = require('http');
const crypto = require('crypto');

const port = Number(process.argv[2] || 8765);
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function stamp() {
  return new Date().toISOString();
}

function encodeFrame(opcode, payload) {
  const length = payload.length;
  let header;
  if (length < 126) {
    header = Buffer.from([0x80 | opcode, length]);
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([header, payload]);
}

const server = http.createServer((request, response) => {
  console.log(`${stamp()} HTTP ${request.method} ${request.url} from ${request.socket.remoteAddress}`);
  response.writeHead(200, { 'content-type': 'text/plain' });
  response.end('spike server up\n');
});

server.on('upgrade', (request, socket) => {
  const key = request.headers['sec-websocket-key'];
  const label = request.url;
  console.log(`${stamp()} OPEN ${label} from ${socket.remoteAddress}:${socket.remotePort} ua=${request.headers['user-agent'] || '-'}`);
  if (!key) {
    socket.destroy();
    return;
  }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  socket.setNoDelay(true);

  let buffered = Buffer.alloc(0);
  let fragments = [];
  let fragmentOpcode = 0;

  socket.on('data', (chunk) => {
    buffered = Buffer.concat([buffered, chunk]);
    for (;;) {
      if (buffered.length < 2) return;
      const fin = (buffered[0] & 0x80) !== 0;
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
      const mask = masked ? buffered.subarray(offset, offset + 4) : null;
      const payload = Buffer.from(buffered.subarray(offset + maskLength, offset + maskLength + length));
      if (mask) {
        for (let index = 0; index < payload.length; index++) payload[index] ^= mask[index & 3];
      }
      buffered = buffered.subarray(offset + maskLength + length);

      if (opcode === 0x8) {
        console.log(`${stamp()} CLOSE ${label}`);
        socket.end(encodeFrame(0x8, Buffer.alloc(0)));
        return;
      }
      if (opcode === 0x9) {
        socket.write(encodeFrame(0xa, payload));
        continue;
      }
      if (opcode === 0xa) continue;

      if (opcode !== 0) fragmentOpcode = opcode;
      fragments.push(payload);
      if (!fin) continue;
      const message = Buffer.concat(fragments);
      const messageOpcode = fragmentOpcode;
      fragments = [];

      if (messageOpcode === 0x1) {
        const text = message.toString('utf8');
        if (text.startsWith('RESULT ') || text.startsWith('LOG ') || text.startsWith('hello')) {
          console.log(`${stamp()} ${label} ${text}`);
        } else if (message.length > 100000) {
          console.log(`${stamp()} ${label} text ${message.length} bytes`);
        }
      } else if (message.length > 100000) {
        console.log(`${stamp()} ${label} binary ${message.length} bytes`);
      }
      socket.write(encodeFrame(messageOpcode, message));
    }
  });
  socket.on('close', () => console.log(`${stamp()} GONE ${label}`));
  socket.on('error', (error) => console.log(`${stamp()} ERROR ${label} ${error.message}`));
});

server.listen(port, '0.0.0.0', () => console.log(`${stamp()} listening on 0.0.0.0:${port}`));
