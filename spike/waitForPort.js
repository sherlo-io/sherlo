// Usage: node spike/waitForPort.js <port> [seconds]  - returns once something listens on the port.
const net = require('net');
const port = Number(process.argv[2]);
const deadline = Date.now() + (Number(process.argv[3]) || 300) * 1000;
(function tryOnce() {
  const socket = net.connect(port, '127.0.0.1');
  socket.on('connect', () => { socket.destroy(); console.log('port', port, 'is up'); });
  socket.on('error', () => {
    socket.destroy();
    if (Date.now() > deadline) { console.log('gave up'); process.exit(1); }
    setTimeout(tryOnce, 2000);
  });
})();
