'use strict';

/**
 * THE APP'S LIVE LOG FEED ON THE BUNDLER - a plain append-and-drain, not a hold.
 *
 * captureSocket.js pairs one waiting app with one waiting tool and holds the line until an answer
 * crosses; this is not that. The app posts a log line the instant RunnerBridge.log forms it (see
 * ../src/helpers/RunnerBridge/captureLogSink.ts) and moves straight on - nobody is held open. That
 * is what makes this the road a hang or a crash inside the walk itself cannot silence: the line is
 * already sitting in THIS process's memory - the bundler's, which outlives the app's own crash -
 * before whatever happens to the app next has a chance to lose it (see ../src/captureTransport.ts's
 * file header for the failure this exists to help diagnose).
 *
 * DRAINED, NOT POLLED WITH A CURSOR. A reader's GET returns every line posted since the last GET and
 * clears the buffer - the same "handed off, remembers nothing more" shape captureSocket.js's own
 * header describes for the main capture protocol. `sherlo capture` reads it once, right after its
 * own POST /sherlo/capture settles (a clean answer OR a give-up), so each capture's read is exactly
 * the lines that walk produced - never a previous capture's leftovers, and never lost to that walk's
 * own outcome.
 *
 * BOUNDED, NOT ENDLESS. A capture session can run over many stories in one boot, logging the whole
 * way; nothing here needs more than recent history at once, and a reader that never asks (an app
 * exercised outside `sherlo capture` entirely - see captureLogSink.ts's no-op sink) must not let this
 * grow without limit.
 */

/** The one address this file serves, beside metro/captureSocket.js's own. */
var CAPTURE_LOG_PATH = '/sherlo/capture-log';

/**
 * The live log feed, as a Metro middleware plus the buffer behind it.
 *
 * @param {{ maxLines?: number }} [settings]
 * @returns {{ middleware: Function, path: string }}
 */
function createCaptureLogSocket(settings) {
  var maxLines = (settings && settings.maxLines) || 1000;

  /** Every line posted so far, oldest first, capped at maxLines. */
  var lines = [];

  function middleware(request, response, next) {
    if (pathOf(request.url) !== CAPTURE_LOG_PATH) return next();

    if (request.method === 'POST') return appPostsALine(request, response);
    if (request.method === 'GET') return readerDrainsTheLines(request, response);

    return next();
  }

  /** The app: here is one line - fire and forget, nothing is held open for it. */
  function appPostsALine(request, response) {
    readJsonBody(request, function (posted) {
      if (typeof posted.line === 'string') {
        lines.push(posted.line);
        if (lines.length > maxLines) lines.shift();
      }
      sendJson(response, {});
    });
  }

  /** A reader: hand over everything posted since the last drain, and hold nothing after. */
  function readerDrainsTheLines(request, response) {
    var drained = lines;
    lines = [];
    sendJson(response, { lines: drained });
  }

  return { middleware: middleware, path: CAPTURE_LOG_PATH };
}

/* ========================================================================== */

/** The path part of a request url, without the query a bundler request may carry. */
function pathOf(url) {
  if (typeof url !== 'string') return '';
  var queryStart = url.indexOf('?');
  return queryStart === -1 ? url : url.slice(0, queryStart);
}

/** A body that is not JSON is read as an empty message rather than thrown at the bundler. */
function readJsonBody(request, whenRead) {
  var body = '';
  request.on('data', function (chunk) {
    body += chunk;
  });
  request.on('end', function () {
    var parsed;
    try {
      parsed = JSON.parse(body || '{}');
    } catch (_) {
      parsed = {};
    }
    whenRead(parsed && typeof parsed === 'object' ? parsed : {});
  });
}

function sendJson(response, payload) {
  var body = JSON.stringify(payload);
  response.writeHead(200, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  response.end(body);
}

module.exports = createCaptureLogSocket;
module.exports.createCaptureLogSocket = createCaptureLogSocket;
module.exports.CAPTURE_LOG_PATH = CAPTURE_LOG_PATH;
