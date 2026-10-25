'use strict';

/**
 * THE SHERLO LINE: the server half of the app's connection, one WebSocket address, `/sherlo/line`.
 *
 * The app's native code dials it and says `hello` first on every connection. Two programs mount it:
 * the developer's bundler, where `sherlo open` and `sherlo capture` reach a running app through it,
 * and the runner, which drives a test run over it. Each calls `attach` with its own HTTP server and
 * its own `ws` WebSocketServer class, so this file requires nothing: the runner keeps a byte-for-byte
 * copy of it. The messages are typed in ./sherloLine.d.ts, from the seam (../src/sealedCore/seam).
 *
 * Who is on the line:
 *
 *   An app is a socket that said `hello` in the protocol this line speaks. A `hello` in any other
 *   protocol is refused, and the socket closed with a reason naming both versions.
 *
 *   A driver asks a question and gets one reply. It asks either over a socket of its own (that is
 *   `sherlo open` and `sherlo capture`, through the bundler's relay) or in the same process, with
 *   `line.ask`. Both are callers of the same rules below; neither says hello.
 *
 * The rules a driver's question meets:
 *
 *   THE LETTERBOX (`openStory`, `whatIsOnScreen`) REMEMBERS. A story asked for while no app at the
 *   story browser is waiting is kept until one is, because reaching the story browser can cost the
 *   app a restart, and nothing waiting inside the app survives that. An app showing itself is told
 *   to go to the story browser instead. `--wait` is answered only once the app says it drew the
 *   story, with what the story threw when it threw.
 *
 *   THE CAPTURE RELAY (`captureStory`) RELAYS. It pairs one waiting app with one waiting driver and
 *   keeps nothing once the answer has crossed. An app not in testing mode is told to move there,
 *   and is handed the story with the order, so it lands on it. A scene, asked by `sceneId`, is
 *   handed to the app as `sceneId`, never as a story, and refused as a story the app does not have
 *   when the scenes its bundle holds (`scenes`) rule it out. An app whose JavaScript died as it
 *   started (`start-failed`) is the one thing it keeps: a capture of it is answered `crashed`, with
 *   the app's error, until that app's JavaScript waits for a capture again or its connection goes.
 *
 *   THE LOG FEED (`readLogLines`) is every `log` line an app sent, drained by each read.
 *
 * `stories: null` from an app means it cannot list its stories (not `[]`, an app with none): a
 * story is then handed over unchecked, and checked once an app lists its stories.
 */

/** Where the line is mounted, on the server's own port. */
var LINE_PATH = '/sherlo/line';

/**
 * The version of the message set this line speaks. The seam's SHERLO_PROTOCOL_VERSION says the
 * same number for the app; an SDK test keeps the two equal.
 */
var PROTOCOL_VERSION = 1;

/**
 * How long an app's wait is held before it is answered with nothing and the app asks again. Long
 * enough that the app is not asking constantly, short enough that an app that went quiet costs one
 * hold rather than for ever.
 */
var APP_HOLD_MS = 20000;

/** How many log lines the feed keeps for a reader that has not come yet; the oldest go first. */
var MOST_LOG_LINES_KEPT = 1000;

/** How long `--wait` waits for the app to draw the story, when the driver does not say. */
var DEFAULT_PAINT_WAIT_SECONDS = 30;

/** The close code of a refused hello: 4000 to 4999 are an application's own (RFC 6455, 7.4.2). */
var REFUSED_HELLO_CLOSE_CODE = 4001;

/** A WebSocket's readyState while it is open, the same number in every client and in `ws`. */
var SOCKET_IS_OPEN = 1;

/** The actions of a driver's questions. Every other action on a socket is the app's. */
var QUESTION_ACTIONS = ['openStory', 'whatIsOnScreen', 'captureStory', 'readLogLines'];

/**
 * Mount the line on `httpServer`: take every WebSocket upgrade for LINE_PATH, and hand every other
 * upgrade to the listeners the server had before, untouched.
 *
 * @param {object} httpServer Node's http.Server, already carrying its own upgrade listeners, if any.
 * @param {Function} WebSocketServer `ws`'s WebSocketServer class (ws 7 calls it `Server`).
 * @param {{ appHoldMs?: number, warn?: (message: string) => void, storyFileChangedSince?: (time: number) => boolean }} [settings]
 */
function attach(httpServer, WebSocketServer, settings) {
  var line = createLine(settings || {});
  var webSocketServer = new WebSocketServer({ noServer: true });
  webSocketServer.on('connection', line.takeSocket);

  var upgradeListenersBefore = httpServer.listeners('upgrade');
  httpServer.removeAllListeners('upgrade');
  httpServer.on('upgrade', function sherloLineUpgrade(request, socket, head) {
    if (pathOf(request.url) === LINE_PATH) {
      webSocketServer.handleUpgrade(request, socket, head, function (webSocket) {
        webSocketServer.emit('connection', webSocket, request);
      });
      return;
    }

    // Nobody else takes upgrades on this server: a socket nobody answers would hang for ever.
    if (upgradeListenersBefore.length === 0) return socket.destroy();

    upgradeListenersBefore.forEach(function (listener) {
      listener.call(httpServer, request, socket, head);
    });
  });

  function close() {
    webSocketServer.clients.forEach(function (webSocket) {
      webSocket.terminate();
    });
    webSocketServer.close();
  }

  // The server's own sockets close with it; the line's close the same way.
  httpServer.on('close', close);

  return { ask: line.ask, onApp: line.onApp, close: close };
}

/** A title the way Storybook turns it into the first part of a story id. */
function idPartOfTitle(title) {
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Why the line refuses this `hello`, in words naming both versions, or null when it speaks it.
 *
 * @param {{ protocolVersion?: unknown }} hello
 * @returns {string | null}
 */
function refusalOfHello(hello) {
  if (hello.protocolVersion === PROTOCOL_VERSION) return null;
  return (
    "Sherlo's line speaks protocol " +
    PROTOCOL_VERSION +
    ', and the app said hello in protocol ' +
    hello.protocolVersion +
    '.'
  );
}

/* ========================================================================== */

/** The line's state and rules, with no server of its own: `attach` hands it every socket. */
function createLine(settings) {
  var appHoldMs = settings.appHoldMs || APP_HOLD_MS;
  var warn = settings.warn || function () {};
  /** A line told nothing of story files sees none changed. */
  var nothingChanged = function () {
    return false;
  };

  var letterbox = createLetterbox(appHoldMs);
  var captureRelay = createCaptureRelay(
    appHoldMs,
    settings.storyFileChangedSince || nothingChanged
  );
  var logFeed = createLogFeed();

  /** Everyone who wants to hear of each app that says hello. */
  var appListeners = [];

  function onApp(listener) {
    appListeners.push(listener);
  }

  /** A new socket: an app once it says hello, a driver when it asks a question. */
  function takeSocket(webSocket) {
    var app = null;
    /** How to stop waiting on each question this socket asked and has no reply to yet. */
    var withdrawals = [];

    webSocket.on('message', function (data) {
      var message = parseMessage(data);
      if (message === null) return;

      if (QUESTION_ACTIONS.indexOf(message.action) !== -1) {
        var withdraw = pose(message, function (reply) {
          sendOn(webSocket, { action: 'reply', askId: message.askId, reply: reply });
        });
        withdrawals.push(withdraw);
        return;
      }

      if (message.action === 'hello') {
        // Native code says hello once on each connection; a second one changes nothing.
        if (app !== null) return;

        var refusal = refusalOfHello(message);
        if (refusal !== null) {
          warn(refusal);
          webSocket.close(REFUSED_HELLO_CLOSE_CODE, refusal);
          return;
        }
        app = appOnTheLine(webSocket, message);
        listenToTheApp(app);
        appListeners.forEach(function (listener) {
          listener(app);
        });
        return;
      }

      // Anything else is the app's, and an app says hello first.
      if (app !== null) app.hear(message);
    });

    webSocket.on('close', function () {
      withdrawals.forEach(function (withdraw) {
        withdraw();
      });
      if (app !== null) app.leave();
    });
  }

  /** The relays hear every app, as any other listener does. */
  function listenToTheApp(app) {
    app.onMessage(function (message) {
      if (message.action === 'waitForStory') return letterbox.appWaitsForAStory(app, message);
      if (message.action === 'waitForACapture')
        return captureRelay.appWaitsForACapture(app, message);
      if (message.action === 'start-failed') return captureRelay.appStartFailed(app, message);
      if (message.action === 'log' && typeof message.line === 'string') logFeed.add(message.line);
    });
    app.onClose(function () {
      letterbox.appLeft(app);
      captureRelay.appLeft(app);
    });
  }

  /**
   * One question, answered once through `reply`. Returns how to stop waiting for it: a driver that
   * went away frees what it held.
   */
  function pose(question, reply) {
    if (question.action === 'openStory') return letterbox.openStory(question, reply);
    if (question.action === 'captureStory') return captureRelay.captureStory(question, reply);

    // The other two are answered at once, and leave nothing waiting.
    if (question.action === 'whatIsOnScreen') reply(letterbox.whatIsOnScreen());
    if (question.action === 'readLogLines') reply({ lines: logFeed.drain() });
    return function nothingToWithdraw() {};
  }

  /** A driver in the same process: ask, and get the reply a driver's socket would. */
  function ask(question) {
    return new Promise(function (resolve) {
      pose(question, resolve);
    });
  }

  return { takeSocket: takeSocket, onApp: onApp, ask: ask };
}

/**
 * An app on the line, as everyone who listens to it sees it: its hello, what it sends, and a way
 * to send it a message.
 */
function appOnTheLine(webSocket, hello) {
  var messageListeners = [];
  var closeListeners = [];

  /**
   * When the line last heard this app's JavaScript start: its hello first, then the
   * JS_EVAL_COMPLETE each run of the JavaScript sends on this same connection, because native code
   * says hello once per connection and a reload keeps the connection.
   */
  var javaScriptStartedAt = Date.now();

  return {
    hello: hello,
    javaScriptStartedAt: function () {
      return javaScriptStartedAt;
    },
    send: function (message) {
      sendOn(webSocket, message);
    },
    onMessage: function (listener) {
      messageListeners.push(listener);
    },
    onClose: function (listener) {
      closeListeners.push(listener);
    },
    close: function () {
      webSocket.close();
    },
    /** The line hands the app's every message after its hello here. */
    hear: function (message) {
      if (message.action === 'JS_EVAL_COMPLETE') javaScriptStartedAt = Date.now();
      messageListeners.forEach(function (listener) {
        listener(message);
      });
    },
    /** The app's socket closed. */
    leave: function () {
      closeListeners.forEach(function (listener) {
        listener();
      });
    },
  };
}

/* ========================================================================== */

/** The letterbox: the rules `sherlo open` meets. */
function createLetterbox(appHoldMs) {
  /**
   * What an app last said about itself: the stories it has, whether it is at the story browser,
   * and the story it drew. Null until an app has waited even once, which is how a driver tells "no
   * app has ever been here" from "the app is between waits".
   */
  var appLastSaid = null;

  /** The story the letterbox is keeping for the next app at the story browser, if any. */
  var storyToHandOver = null;

  /** Every app waiting for a story right now, each to be answered once. */
  var appsWaiting = [];

  /** Every `--wait` driver waiting right now, each for its own story to be drawn. */
  var waitingForPaint = [];

  /** The app: this is what I have and where I am; answer me when there is a story. */
  function appWaitsForAStory(app, said) {
    // The JavaScript running now is the one that listens: an app's earlier wait is dropped.
    stopTheWaitOf(app);

    var atTheStoryBrowser = said.atTheStoryBrowser === true;
    var showing = atTheStoryBrowser && typeof said.showing === 'string' ? said.showing : null;

    appLastSaid = {
      // Null stays null: an app that cannot list its stories is not an app with none.
      stories: Array.isArray(said.stories) ? said.stories : null,
      atTheStoryBrowser: atTheStoryBrowser,
      // An app showing itself has no story on screen, whatever it last drew.
      showing: showing,
      // What the story on screen threw, and so only meaningful with a story on screen.
      threw: showing === null ? null : readThrew(said.threw),
    };

    // This wait is also the app's answer: a story it names as drawn releases the `--wait` driver
    // that asked for it, carrying what that story threw when it threw.
    releasePaintWaiters(appLastSaid.showing, appLastSaid.threw);

    // An app that lists its stories settles a story that was handed over unchecked.
    if (appLastSaid.stories !== null) refuseTheStoryIfUnknown(appLastSaid.stories);

    if (storyToHandOver !== null) {
      if (!atTheStoryBrowser) return answerApp(app, { goToTheStoryBrowser: true });

      var keptStory = storyToHandOver;
      storyToHandOver = null;
      return answerApp(app, { storyId: keptStory });
    }

    holdTheApp(app, atTheStoryBrowser);
  }

  function holdTheApp(app, atTheStoryBrowser) {
    var held = {
      app: app,
      atTheStoryBrowser: atTheStoryBrowser,
      done: false,

      /** Take this wait off the list, once. True when this call is the one that took it off. */
      stopWaiting: function () {
        if (held.done) return false;
        held.done = true;
        clearTimeout(held.timer);
        appsWaiting = appsWaiting.filter(function (other) {
          return other !== held;
        });
        return true;
      },

      answer: function (payload) {
        if (held.stopWaiting()) answerApp(app, payload);
      },
    };

    held.timer = setTimeout(function () {
      held.answer({ storyId: null });
    }, appHoldMs);

    appsWaiting.push(held);
  }

  function stopTheWaitOf(app) {
    appsWaiting
      .filter(function (held) {
        return held.app === app;
      })
      .forEach(function (held) {
        held.stopWaiting();
      });
  }

  /** A driver: show this story. */
  function openStory(question, reply) {
    var storyId = typeof question.storyId === 'string' ? question.storyId : '';

    if (!appLastSaid) {
      reply({ kind: 'no-app' });
      return function () {};
    }

    // An app that cannot list its stories takes the story unchecked: the story browser checks it.
    if (appLastSaid.stories !== null && appLastSaid.stories.indexOf(storyId) === -1) {
      reply({ kind: 'no-such-story', known: appLastSaid.stories });
      return function () {};
    }

    storyToHandOver = storyId;
    handOverToWaitingApps();

    if (!question.wait) {
      reply({ kind: 'handed-over', storyId: storyId, rendered: 'not-waited' });
      return function () {};
    }

    return waitForPaint(
      storyId,
      secondsOf(question.timeoutSeconds),
      function (painted, threw) {
        var answer = {
          kind: 'handed-over',
          storyId: storyId,
          rendered: painted ? 'yes' : 'timed-out',
        };
        // Said only when the story broke: a story that drew cleanly has nothing to report.
        if (threw) answer.threw = threw;
        reply(answer);
      },
      function (known) {
        reply({ kind: 'no-such-story', known: known });
      }
    );
  }

  /** A driver: which story is on screen. */
  function whatIsOnScreen() {
    // `no-app` means what it says: nothing carrying the SDK has ever waited here.
    if (!appLastSaid) return { kind: 'no-app' };

    // The app IS here, and is not showing a story: it shows itself, or it reached the story
    // browser and has not drawn one yet. Answering `no-app` would tell the reader to do something
    // they have already done.
    if (!appLastSaid.showing) return { kind: 'not-at-story-browser' };

    return { kind: 'showing', storyId: appLastSaid.showing };
  }

  /**
   * Hand the kept story to every app waiting AT THE STORY BROWSER, and send every other one there.
   * A developer usually has one device on a bundler; with two, both go to the story, the only
   * answer that is not a coin toss about which device the developer meant.
   *
   * The story is cleared only when an app that can draw it took it. An app on its way to the story
   * browser took nothing: the story has to be here when it comes back.
   */
  function handOverToWaitingApps() {
    if (storyToHandOver === null || appsWaiting.length === 0) return;

    var waiting = appsWaiting.slice();

    waiting.forEach(function (held) {
      if (!held.atTheStoryBrowser) held.answer({ goToTheStoryBrowser: true });
    });

    var readyForIt = waiting.filter(function (held) {
      return held.atTheStoryBrowser;
    });
    if (readyForIt.length === 0) return;

    var storyId = storyToHandOver;
    storyToHandOver = null;
    readyForIt.forEach(function (held) {
      held.answer({ storyId: storyId });
    });
  }

  /**
   * A story was handed over unchecked, and an app has now listed its stories. When the story is
   * not among them, the driver still waiting on it is told so, and the story is forgotten.
   */
  function refuseTheStoryIfUnknown(knownStories) {
    if (storyToHandOver === null || knownStories.indexOf(storyToHandOver) !== -1) return;

    var unknownStory = storyToHandOver;
    storyToHandOver = null;

    waitingForPaint
      .filter(function (waiter) {
        return waiter.storyId === unknownStory;
      })
      .forEach(function (waiter) {
        waiter.refuse(knownStories);
      });
  }

  /** Wait for the app to say it drew `storyId`. Returns how to stop waiting. */
  function waitForPaint(storyId, timeoutSeconds, report, refuse) {
    var waiter = {
      storyId: storyId,
      reported: false,
      report: function (painted, threw) {
        if (waiter.stopWaiting()) report(painted, threw);
      },
      refuse: function (known) {
        if (waiter.stopWaiting()) refuse(known);
      },
      /** Take this driver off the list, once. True when this call is the one that took it off. */
      stopWaiting: function () {
        if (waiter.reported) return false;
        waiter.reported = true;
        clearTimeout(waiter.timer);
        waitingForPaint = waitingForPaint.filter(function (other) {
          return other !== waiter;
        });
        return true;
      },
    };

    waiter.timer = setTimeout(function () {
      waiter.report(false, null);
    }, timeoutSeconds * 1000);

    waitingForPaint.push(waiter);
    return waiter.stopWaiting;
  }

  function releasePaintWaiters(paintedStoryId, threw) {
    if (!paintedStoryId) return;

    waitingForPaint
      .filter(function (waiter) {
        return waiter.storyId === paintedStoryId;
      })
      .forEach(function (waiter) {
        waiter.report(true, threw);
      });
  }

  /** An app that went away frees its place; the story it never collected stays kept. */
  function appLeft(app) {
    stopTheWaitOf(app);
  }

  function answerApp(app, payload) {
    app.send(Object.assign({ action: 'letterboxAnswer' }, payload));
  }

  return {
    appWaitsForAStory: appWaitsForAStory,
    appLeft: appLeft,
    openStory: openStory,
    whatIsOnScreen: whatIsOnScreen,
  };
}

/* ========================================================================== */

/** The capture relay: the rules `sherlo capture` meets. */
function createCaptureRelay(appHoldMs, storyFileChangedSince) {
  /** Whether an app has ever waited for a capture: how a driver tells no-app from idle. */
  var appEverWaited = false;

  /** The app waiting for a capture, when one is. */
  var appHolding = null;

  /** The driver waiting for the app's answer, when one is. */
  var driverWaiting = null;

  /** Each app on the line whose JavaScript died as it started, with what it threw, latest last. */
  var startFailures = [];

  /** The app: my JavaScript died as it started, before it could wait; here is what it threw. */
  function appStartFailed(app, said) {
    forgetTheStartFailureOf(app);
    var error = {
      name: typeof said.name === 'string' ? said.name : 'Error',
      message: typeof said.message === 'string' ? said.message : '',
    };
    startFailures.push({ app: app, error: error });

    // The JavaScript that waited before is gone, and the driver waiting on it is answered now.
    if (appHolding !== null && appHolding.app === app) appHolding.stopWaiting();
    if (driverWaiting !== null) {
      var told = driverWaiting;
      driverWaiting = null;
      told.reply({ kind: 'crashed', storyId: told.storyId, error: error });
    }
  }

  function forgetTheStartFailureOf(app) {
    startFailures = startFailures.filter(function (failure) {
      return failure.app !== app;
    });
  }

  /**
   * Whether this app must reload its JavaScript into testing mode before it walks a story: it is
   * not in testing mode, or a story file changed after its JavaScript said hello. The files are
   * checked here, when a capture is asked, never on a timer.
   */
  function mustRestartForACapture(app, mode) {
    return mode !== 'testing' || storyFileChangedSince(app.javaScriptStartedAt());
  }

  /** The app: here is my mode, my stories, my scenes and my answer; hand me the next capture. */
  function appWaitsForACapture(app, said) {
    appEverWaited = true;
    // An app whose JavaScript waits started cleanly this time, whatever the one before it did.
    forgetTheStartFailureOf(app);

    // The JavaScript running now is the one that listens: an app's earlier wait is dropped.
    if (appHolding !== null && appHolding.app === app) appHolding.stopWaiting();

    var facts = {
      // Null stays null: an app that cannot list its stories is not an app with none.
      stories: Array.isArray(said.stories) ? said.stories : null,
      // The scenes the app's bundle holds; null from an app whose SDK does not say them.
      scenes: Array.isArray(said.scenes) ? said.scenes : null,
      // The story files that threw as the app loaded them, kept as the app said them.
      brokenFiles: Array.isArray(said.brokenFiles) ? said.brokenFiles : [],
      mode: typeof said.mode === 'string' ? said.mode : '',
    };
    var answer = said.answer == null ? null : said.answer;

    // A wait that carries an answer is the app answering the capture it was handed. Pass it to the
    // waiting driver, and let the app come back for the next capture.
    if (answer !== null) {
      if (driverWaiting !== null) {
        var answered = driverWaiting;
        driverWaiting = null;
        answered.reply(answer);
      }
      return answerApp(app, {});
    }

    // A wait with no answer is the app ready for a capture. Pair it with a waiting driver now, or
    // hold it until a driver comes.
    if (driverWaiting !== null) {
      var refusal = refusalOf(driverWaiting, app, facts);
      if (refusal !== null) {
        var refused = driverWaiting;
        driverWaiting = null;
        refused.reply(refusal);
        return answerApp(app, {});
      }

      return answerApp(app, instructionFor(driverWaiting, app, facts.mode));
    }

    holdTheApp(app, facts);
  }

  /**
   * The answer for a story the app does not have. The broken files it names are those whose title
   * is the story id's title part (the id before "--"); when none is, every broken file, because a
   * file whose title could not be read may still hold the story. Each goes as file and error only.
   */
  function noSuchStory(known, brokenFiles, storyId) {
    var answer = { kind: 'no-such-story', known: known };
    var titlePart = String(storyId).split('--')[0];
    var matching = brokenFiles.filter(function (broken) {
      return broken.title !== undefined && idPartOfTitle(broken.title) === titlePart;
    });
    var named = matching.length > 0 ? matching : brokenFiles;
    if (named.length > 0) {
      answer.brokenFiles = named.map(function (broken) {
        return { file: broken.file, error: broken.error };
      });
    }
    return answer;
  }

  function holdTheApp(app, facts) {
    var held = {
      app: app,
      facts: facts,
      done: false,

      /** Take this wait off the line, once. True when this call is the one that took it off. */
      stopWaiting: function () {
        if (held.done) return false;
        held.done = true;
        clearTimeout(held.timer);
        if (appHolding === held) appHolding = null;
        return true;
      },

      answer: function (payload) {
        if (held.stopWaiting()) answerApp(app, payload);
      },
    };

    held.timer = setTimeout(function () {
      held.answer({});
    }, appHoldMs);

    appHolding = held;
  }

  /**
   * The answer that refuses what a driver waits for, or null when the app may be handed it.
   *
   * - A story is refused when the app's list of stories rules it out. An app that cannot list its
   *   stories is not checked yet: it is checked once it is in testing mode and lists them.
   * - A scene is never in that list. It is refused when the scenes the app's bundle holds rule it
   *   out, and only on the JavaScript it would be handed to: an app told to reload first comes back
   *   with the bundle as it is now, and is checked then. An app that does not say its scenes is not
   *   checked. The refusal names the scenes the bundle holds, the way a story's names the stories.
   */
  function refusalOf(waiting, app, facts) {
    if (waiting.sceneId === undefined) {
      var lacksTheStory = facts.stories !== null && facts.stories.indexOf(waiting.storyId) === -1;
      return lacksTheStory ? noSuchStory(facts.stories, facts.brokenFiles, waiting.storyId) : null;
    }
    var lacksTheScene = facts.scenes !== null && facts.scenes.indexOf(waiting.sceneId) === -1;
    if (!lacksTheScene || mustRestartForACapture(app, facts.mode)) return null;
    return { kind: 'no-such-story', known: facts.scenes };
  }

  /**
   * What the app is handed for the capture a driver waits for.
   *
   * The capture has to count as a test run, so the app has to be in testing mode, running code that
   * reads the story files as they are now. Else it is told to reload there, with the id to land on
   * (a scene's too: the app boots on a scene the way it lands on a story); the driver keeps waiting
   * across the reload. An app in testing mode is handed a scene as `sceneId`, which the core walks
   * with no Storybook, and a story as `storyId`, which it walks through Storybook's channel.
   */
  function instructionFor(waiting, app, mode) {
    var isAScene = waiting.sceneId !== undefined;
    if (mustRestartForACapture(app, mode)) {
      return { restartIntoTesting: true, storyId: isAScene ? waiting.sceneId : waiting.storyId };
    }
    if (isAScene) return { sceneId: waiting.sceneId, settings: waiting.settings };
    return { storyId: waiting.storyId, settings: waiting.settings };
  }

  /**
   * A driver: capture this story, or this scene (`sceneId` in place of `storyId`, as
   * `sherlo capture --scene` asks), with these settings, and wait for what the app records.
   */
  function captureStory(question, reply) {
    var sceneId = typeof question.sceneId === 'string' ? question.sceneId : undefined;
    var storyId = typeof question.storyId === 'string' ? question.storyId : '';
    var settings = question.settings;

    // No app is alive and waiting, and one died as it started: that is the answer, at once.
    if (appHolding === null && startFailures.length > 0) {
      var error = startFailures[startFailures.length - 1].error;
      reply(
        sceneId !== undefined
          ? { kind: 'crashed', sceneId: sceneId, error: error }
          : { kind: 'crashed', storyId: storyId, error: error }
      );
      return function () {};
    }

    if (!appEverWaited) {
      reply({ kind: 'no-app' });
      return function () {};
    }

    var waiting = { storyId: storyId, sceneId: sceneId, settings: settings, reply: reply };
    driverWaiting = waiting;

    /** A driver that gave up waiting frees its place for the next one. */
    function withdraw() {
      if (driverWaiting === waiting) driverWaiting = null;
    }

    if (appHolding === null) return withdraw;

    var held = appHolding;

    var refusal = refusalOf(waiting, held.app, held.facts);
    if (refusal !== null) {
      driverWaiting = null;
      held.answer({});
      reply(refusal);
      return withdraw;
    }

    held.answer(instructionFor(waiting, held.app, held.facts.mode));
    return withdraw;
  }

  function appLeft(app) {
    if (appHolding !== null && appHolding.app === app) appHolding.stopWaiting();
    forgetTheStartFailureOf(app);
  }

  function answerApp(app, payload) {
    app.send(Object.assign({ action: 'captureInstruction' }, payload));
  }

  return {
    appWaitsForACapture: appWaitsForACapture,
    appStartFailed: appStartFailed,
    appLeft: appLeft,
    captureStory: captureStory,
  };
}

/* ========================================================================== */

/**
 * The log feed: every line the app sent, oldest first, handed over and forgotten by each read. The
 * line keeps it in the server's process, which outlives the app's own crash, so a capture that
 * never finishes still has its lines.
 */
function createLogFeed() {
  var lines = [];

  return {
    add: function (line) {
      lines.push(line);
      if (lines.length > MOST_LOG_LINES_KEPT) lines.shift();
    },
    drain: function () {
      var drained = lines;
      lines = [];
      return drained;
    },
  };
}

/* ========================================================================== */

/** The path part of a request url, without the query it may carry. */
function pathOf(url) {
  if (typeof url !== 'string') return '';
  var queryStart = url.indexOf('?');
  return queryStart === -1 ? url : url.slice(0, queryStart);
}

/** A frame that is not a JSON object with an action is no message, and is ignored. */
function parseMessage(data) {
  try {
    var message = JSON.parse(String(data));
    return message && typeof message === 'object' && typeof message.action === 'string'
      ? message
      : null;
  } catch (_) {
    return null;
  }
}

function sendOn(webSocket, message) {
  if (webSocket.readyState === SOCKET_IS_OPEN) webSocket.send(JSON.stringify(message));
}

/**
 * What the app said its story threw, or null when it said nothing readable. Its name and message,
 * and nothing else: those are the words that reach a developer's terminal.
 */
function readThrew(said) {
  if (!said || typeof said !== 'object') return null;
  if (typeof said.name !== 'string' || typeof said.message !== 'string') return null;
  return { name: said.name, message: said.message };
}

/** A wait the driver did not state, or stated nonsensically, falls back to half a minute. */
function secondsOf(passed) {
  return typeof passed === 'number' && isFinite(passed) && passed > 0
    ? passed
    : DEFAULT_PAINT_WAIT_SECONDS;
}

module.exports = {
  attach: attach,
  refusalOfHello: refusalOfHello,
  idPartOfTitle: idPartOfTitle,
  LINE_PATH: LINE_PATH,
  PROTOCOL_VERSION: PROTOCOL_VERSION,
};
