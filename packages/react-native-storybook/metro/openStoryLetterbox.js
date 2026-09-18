'use strict';

/**
 * THE LETTERBOX ON THE BUNDLER - one address, three verbs, and the road `sherlo open` reaches a
 * running app down.
 *
 *   PUT   the app: "these are my stories, this one is on screen - hold my request until there is a
 *         story for me". The answer is the next story to show, or nothing when the hold runs out.
 *   POST  the tool: "show this story". The answer says what became of it.
 *   GET   the tool: "which story is on screen".
 *
 * IT REMEMBERS RATHER THAN RELAYS. A story posted while no app holds a request is kept until one
 * connects, because reaching the story browser costs a restart and a relay would drop the ask on
 * the floor in the middle of it.
 *
 * THE APP'S OWN REQUEST IS ITS ANSWER TOO. Every PUT carries the story the app has painted, so
 * `--wait` is held here until a PUT names the story that was posted - the tool reports a story on
 * screen only because the app said so first.
 *
 * It lives beside the bundler rather than on a port of its own: the bundler's address is the one
 * every device a developer uses can already reach - a simulator, a phone on the same network, a
 * phone plugged in by cable - and a second port would be a second thing to tunnel on every one.
 */

/** The one address Sherlo adds to the bundler. */
var LETTERBOX_PATH = '/sherlo/letterbox';

/**
 * How long a waiting app's request is held before it is answered with nothing and asked to come
 * back. Long enough that the app is not re-asking constantly, short enough that a connection cut
 * mid-hold costs one hold rather than for ever.
 */
var APP_HOLD_MS = 20000;

/**
 * The letterbox, as a Metro middleware plus the state behind it.
 *
 * @param {{ appHoldMs?: number }} [settings]
 * @returns {{ middleware: Function, path: string }}
 */
function createOpenStoryLetterbox(settings) {
  var appHoldMs = (settings && settings.appHoldMs) || APP_HOLD_MS;

  /**
   * What the app last said about itself: the stories it has, and the one it has painted. Null
   * until an app has connected even once - which is how the tool tells "no app has ever been
   * here" from "the app is between requests".
   */
  var appLastSaid = null;

  /** The story the letterbox is holding for the next app to ask, if any. */
  var storyToHandOver = null;

  /** Every app request held open right now, each ready to be answered with one story. */
  var appsWaiting = [];

  /** Every `--wait` caller held open right now, each waiting for its own story to be painted. */
  var waitingForPaint = [];

  function middleware(request, response, next) {
    if (pathOf(request.url) !== LETTERBOX_PATH) return next();

    if (request.method === 'PUT') return appWaitsForAStory(request, response);
    if (request.method === 'POST') return toolPostsAStory(request, response);
    if (request.method === 'GET') return toolAsksWhatIsOnScreen(response);

    return next();
  }

  /** The app: say what I have and what I am showing, then hold my request until there is a story. */
  function appWaitsForAStory(request, response) {
    readJsonBody(request, function (said) {
      appLastSaid = {
        stories: Array.isArray(said.stories) ? said.stories : [],
        showing: typeof said.showing === 'string' ? said.showing : null,
      };

      // This request is also the app's answer: a story it names as painted releases the `--wait`
      // caller that posted it.
      releasePaintWaiters(appLastSaid.showing);

      if (storyToHandOver !== null) {
        var remembered = storyToHandOver;
        storyToHandOver = null;
        return sendJson(response, { storyId: remembered });
      }

      holdAppRequest(response);
    });
  }

  function holdAppRequest(response) {
    var held = {
      done: false,

      /** Take this hold off the list, once. True when this call is the one that took it off. */
      stopWaiting: function () {
        if (held.done) return false;
        held.done = true;
        clearTimeout(held.timer);
        appsWaiting = appsWaiting.filter(function (other) {
          return other !== held;
        });
        return true;
      },

      answer: function (storyId) {
        if (held.stopWaiting()) sendJson(response, { storyId: storyId });
      },
    };

    held.timer = setTimeout(function () {
      held.answer(null);
    }, appHoldMs);

    // A device that went away frees its slot; the story it never collected stays remembered. This
    // watches the RESPONSE rather than the request: a request stream closes the moment its body has
    // been read, which is the normal start of a hold, while the response closes only once the hold
    // is over - and by then `stopWaiting` has nothing left to do.
    response.on('close', held.stopWaiting);

    appsWaiting.push(held);
  }

  /** The tool: show this story. */
  function toolPostsAStory(request, response) {
    readJsonBody(request, function (posted) {
      var storyId = typeof posted.storyId === 'string' ? posted.storyId : '';

      if (!appLastSaid) return sendJson(response, { kind: 'no-app' });

      if (appLastSaid.stories.indexOf(storyId) === -1) {
        return sendJson(response, { kind: 'no-such-story', known: appLastSaid.stories });
      }

      storyToHandOver = storyId;
      handOverToWaitingApps();

      if (!posted.wait) {
        return sendJson(response, {
          kind: 'handed-over',
          storyId: storyId,
          rendered: 'not-waited',
        });
      }

      waitForPaint(storyId, secondsOf(posted.timeoutSeconds), function (painted) {
        sendJson(response, {
          kind: 'handed-over',
          storyId: storyId,
          rendered: painted ? 'yes' : 'timed-out',
        });
      });
    });
  }

  /** The tool: which story is on screen. */
  function toolAsksWhatIsOnScreen(response) {
    // An app that has connected but has painted nothing yet is no more use to this question than
    // one that never connected, and `no-app` is the answer that tells the reader what to do.
    if (!appLastSaid || !appLastSaid.showing) return sendJson(response, { kind: 'no-app' });

    return sendJson(response, { kind: 'showing', storyId: appLastSaid.showing });
  }

  /**
   * Hand the remembered story to every app holding a request. A developer usually has one device on
   * a bundler and this hands it to that one; with two, both go to the story, which is the only
   * answer that is not a coin toss about which device the developer meant.
   */
  function handOverToWaitingApps() {
    if (storyToHandOver === null || appsWaiting.length === 0) return;

    var storyId = storyToHandOver;
    storyToHandOver = null;
    appsWaiting.slice().forEach(function (held) {
      held.answer(storyId);
    });
  }

  function waitForPaint(storyId, timeoutSeconds, report) {
    var waiter = {
      storyId: storyId,
      report: function (painted) {
        if (waiter.reported) return;
        waiter.reported = true;
        clearTimeout(waiter.timer);
        waitingForPaint = waitingForPaint.filter(function (other) {
          return other !== waiter;
        });
        report(painted);
      },
      reported: false,
      timer: null,
    };

    waiter.timer = setTimeout(function () {
      waiter.report(false);
    }, timeoutSeconds * 1000);

    waitingForPaint.push(waiter);
  }

  function releasePaintWaiters(paintedStoryId) {
    if (!paintedStoryId) return;

    waitingForPaint
      .filter(function (waiter) {
        return waiter.storyId === paintedStoryId;
      })
      .forEach(function (waiter) {
        waiter.report(true);
      });
  }

  return { middleware: middleware, path: LETTERBOX_PATH };
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

/** A timeout the tool did not state, or stated nonsensically, falls back to half a minute. */
function secondsOf(passed) {
  return typeof passed === 'number' && isFinite(passed) && passed > 0 ? passed : 30;
}

module.exports = createOpenStoryLetterbox;
module.exports.createOpenStoryLetterbox = createOpenStoryLetterbox;
module.exports.LETTERBOX_PATH = LETTERBOX_PATH;
