'use strict';

/**
 * SPIKE (metro-websocket): ONE WebSocket address on the bundler's own port - /sherlo/line.
 *
 * Metro's runServer owns the HTTP server's 'upgrade' event: its one listener looks the request's
 * path up in a fixed table of endpoints (/hot, plus the ones the React Native CLI passes in) and
 * destroys the socket of any path not in it. A Metro CONFIG has no door into that table - the
 * config only reaches `server.enhanceMiddleware(middleware, metroServer)`, which runs before the
 * HTTP server exists and is handed no server. What it does see, on every plain HTTP request, is
 * `request.socket.server` - the HTTP server itself. So:
 *
 *   1. the middleware learns the HTTP server from the first request that passes through it;
 *   2. it takes Metro's own 'upgrade' listeners off, and puts back ONE listener that answers
 *      /sherlo/line itself and hands every other path to Metro's original listeners untouched.
 *
 * (A listener merely added beside Metro's does not work: Metro's listener still runs for our path
 * and destroys the socket we just upgraded.)
 *
 * The WebSocket server comes from `ws` as Metro itself loads it - Metro depends on ws, the SDK does
 * not, and this file is bundled into dist-metro, so it is required at run time from Metro's folder.
 */

var LINE_PATH = '/sherlo/line';

var ATTACHED = Symbol.for('sherlo.line.attached');

function loadWebSocketServer(projectRoot) {
  var requireFromProject = require('module').createRequire(require('path').join(projectRoot, 'package.json'));
  var metroManifest = requireFromProject.resolve('metro/package.json');
  var ws = require('module').createRequire(metroManifest)('ws');
  // ws 7 exposes `Server`, ws 8 adds `WebSocketServer` as the same class.
  return ws.WebSocketServer || ws.Server;
}

/**
 * @param {{ projectRoot: string }} settings
 * @returns {{ path: string, noteRequest: Function, wss: object }}
 */
function createSherloLine(settings) {
  // Made on the first request, not when the config loads: loading must never fail on it.
  var wss = null;
  function webSocketServer() {
    if (wss) return wss;
    var WebSocketServer = loadWebSocketServer(settings.projectRoot);
    wss = new WebSocketServer({ noServer: true });
    wss.on('connection', function (socket) {
      socket.send(JSON.stringify({ hello: 'sherlo-line' }));
      socket.on('message', function (data) {
        socket.send(JSON.stringify({ echo: data.toString() }));
      });
    });
    return wss;
  }

  function pathOf(url) {
    return new URL(url, 'resolve://').pathname;
  }

  function attachTo(httpServer) {
    if (!httpServer || httpServer[ATTACHED]) return;
    httpServer[ATTACHED] = true;

    // Metro (and Expo) close their own sockets when the server closes; ours is closed the same way.
    httpServer.on('close', function () {
      if (!wss) return;
      wss.clients.forEach(function (client) {
        client.terminate();
      });
      wss.close();
    });

    var metrosListeners = httpServer.listeners('upgrade');
    httpServer.removeAllListeners('upgrade');
    httpServer.on('upgrade', function (request, socket, head) {
      if (pathOf(request.url) === LINE_PATH) {
        var server = webSocketServer();
        server.handleUpgrade(request, socket, head, function (ws) {
          server.emit('connection', ws, request);
        });
        return;
      }
      for (var i = 0; i < metrosListeners.length; i++) {
        metrosListeners[i].call(httpServer, request, socket, head);
      }
    });
  }

  /** Called with every plain HTTP request the bundler gets: that is how the HTTP server is found. */
  function noteRequest(request) {
    attachTo(request.socket && request.socket.server);
  }

  return { path: LINE_PATH, noteRequest: noteRequest };
}

module.exports = createSherloLine;
module.exports.LINE_PATH = LINE_PATH;
