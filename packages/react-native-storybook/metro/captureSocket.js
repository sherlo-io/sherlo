'use strict';

/**
 * THE CAPTURE RELAY ON THE BUNDLER - one address, two verbs, and the road `sherlo capture` reaches a
 * running app down.
 *
 *   PUT   the app: "here is my mode, my stories, and the answer to the capture I was last handed -
 *          hold my request until there is a capture for me". The answer is an instruction to restart
 *          into testing mode, the story to capture with its stabilization settings, or nothing when
 *          the hold runs out.
 *   POST  the tool: "capture this story with these settings". The answer is what the app recorded.
 *
 * THE RESTART INSTRUCTION CARRIES THE STORY TOO, NOT JUST THE ASK TO RESTART. The relay already knows
 * which story the tool is waiting for at the exact moment it tells the app to restart into testing
 * mode - that story and the restart are decided from the same held POST - so it hands both over
 * together rather than making the app come back and ask a second time. What the app does with that
 * story id before it restarts is the app's own concern (see captureTransport.ts); the relay's part is
 * only to stop throwing the one fact away that the app cannot get any other way.
 *
 * IT RELAYS RATHER THAN REMEMBERS. A capture is a conversation - settings one way, a whole view tree
 * the other - and the relay only ever pairs one waiting app with one waiting tool. Once the answer
 * has crossed, it holds nothing: there is no story to remember across a restart the way the
 * letterbox remembers one, because the answer has to come from a story that has just been walked.
 *
 * THE APP'S OWN REQUEST IS ITS ANSWER TOO. The app's PUT carries the answer to the capture it was
 * last handed, so a POST is held here until a PUT names the answer. The tool reports a captured
 * story only because the app said so first.
 *
 * It lives beside the bundler rather than on a port of its own, for the same reason the letterbox
 * does: the bundler's address is the one every device a developer uses can already reach.
 */

/** The one address Sherlo adds to the bundler, beside the letterbox. */
var CAPTURE_PATH = '/sherlo/capture';

/**
 * How long a waiting app's request is held before it is answered with nothing and asked to come
 * back. Long enough that the app is not re-asking constantly, short enough that a connection cut
 * mid-hold costs one hold rather than for ever.
 */
var APP_HOLD_MS = 20000;

/**
 * The capture relay, as a Metro middleware plus the state behind it.
 *
 * @param {{ appHoldMs?: number }} [settings]
 * @returns {{ middleware: Function, path: string }}
 */
function createCaptureSocket(settings) {
  var appHoldMs = (settings && settings.appHoldMs) || APP_HOLD_MS;

  /** Whether an app carrying the SDK has ever connected - how the tool tells no-app from idle. */
  var appEverConnected = false;

  /** The app's held PUT, waiting for a capture, when one is on the line. */
  var appHolding = null;

  /** The tool's held POST, waiting for the app's answer, when one is on the line. */
  var toolWaiting = null;

  function middleware(request, response, next) {
    if (pathOf(request.url) !== CAPTURE_PATH) return next();

    if (request.method === 'PUT') return appReports(request, response);
    if (request.method === 'POST') return toolAsksForACapture(request, response);

    return next();
  }

  /** The app: here is my mode, my stories, and my answer - hold me until there is a capture. */
  function appReports(request, response) {
    readJsonBody(request, function (said) {
      appEverConnected = true;

      var stories = Array.isArray(said.stories) ? said.stories : [];
      var answer = said.answer == null ? null : said.answer;
      var mode = typeof said.mode === 'string' ? said.mode : '';

      // A PUT that carries an answer is the app answering the capture it was handed. Pass it to the
      // waiting tool, and let the app come back for the next capture.
      if (answer !== null) {
        if (toolWaiting) {
          var waiting = toolWaiting;
          toolWaiting = null;
          sendJson(waiting.response, answer);
        }
        return sendJson(response, {});
      }

      // A PUT with no answer is the app waiting for a capture. Pair it with a waiting tool now, or
      // hold it until a tool arrives.
      if (toolWaiting) {
        if (stories.indexOf(toolWaiting.storyId) === -1) {
          var refused = toolWaiting;
          toolWaiting = null;
          sendJson(refused.response, { kind: 'no-such-story', known: stories });
          return sendJson(response, {});
        }

        if (mode !== 'testing') {
          // The story the app walks has to count as a test run, so the app must be in testing mode.
          // Tell it to restart there; the tool's POST stays held across the restart. The story id
          // rides along so the app can land on it directly instead of booting onto a story of its
          // own choosing and moving off it afterwards (see the file header).
          return sendJson(response, { restartIntoTesting: true, storyId: toolWaiting.storyId });
        }

        return sendJson(response, {
          storyId: toolWaiting.storyId,
          settings: toolWaiting.settings,
        });
      }

      holdAppRequest(response, stories, mode);
    });
  }

  /** Hold the app's PUT open until a capture arrives, or the hold runs out. */
  function holdAppRequest(response, stories, mode) {
    var held = {
      response: response,
      stories: stories,
      mode: mode,
      done: false,

      /** Take this hold off the line, once. True when this call is the one that took it off. */
      stopWaiting: function () {
        if (held.done) return false;
        held.done = true;
        clearTimeout(held.timer);
        appHolding = null;
        return true;
      },

      answer: function (payload) {
        if (held.stopWaiting()) sendJson(response, payload);
      },
    };

    held.timer = setTimeout(function () {
      held.answer({});
    }, appHoldMs);

    // A device that went away frees its slot. This watches the RESPONSE rather than the request, for
    // the same reason the letterbox does: the request stream closes once its body has been read,
    // which is the normal start of a hold, while the response closes only once the hold is over.
    response.on('close', held.stopWaiting);

    appHolding = held;
  }

  /** The tool: capture this story with these settings, and hold the line for what the app records. */
  function toolAsksForACapture(request, response) {
    readJsonBody(request, function (posted) {
      var storyId = typeof posted.storyId === 'string' ? posted.storyId : '';
      var settings = posted.settings;

      if (!appEverConnected) return sendJson(response, { kind: 'no-app' });

      toolWaiting = { response: response, storyId: storyId, settings: settings };

      // The tool may give up waiting (its own patience), and this frees the slot for the next one.
      response.on('close', function () {
        if (toolWaiting && toolWaiting.response === response) toolWaiting = null;
      });

      if (!appHolding) return;

      var held = appHolding;

      if (held.stories.indexOf(storyId) === -1) {
        toolWaiting = null;
        held.answer({});
        return sendJson(response, { kind: 'no-such-story', known: held.stories });
      }

      if (held.mode !== 'testing') {
        held.answer({ restartIntoTesting: true, storyId: storyId });
      } else {
        held.answer({ storyId: storyId, settings: settings });
      }
    });
  }

  return { middleware: middleware, path: CAPTURE_PATH };
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

module.exports = createCaptureSocket;
module.exports.createCaptureSocket = createCaptureSocket;
module.exports.CAPTURE_PATH = CAPTURE_PATH;
