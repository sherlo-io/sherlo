/**
 * THE LOCAL SERVER SEAM - the small web server `sherlo capture-report` shows the review page from.
 *
 *     live   - a server on this computer's own address (127.0.0.1), on a free port.
 *     posed  - the pose's `localServer`: the port it answers on. Nothing listens.
 *
 * It serves three things and nothing else:
 *
 *     /                              the web app's own review page, from the folder the CLI ships
 *     /data/report.json              the report, built again on every read
 *     /data/pictures/<folder>.png    the picture a kept capture holds, by the name of its folder
 *
 * ONLY THIS COMPUTER CAN REACH IT. It listens on 127.0.0.1, so nobody else on the network reads
 * the pictures. A path that climbs out of the page folder or the captures folder is a 404.
 *
 * THE PAGE IS SHIPPED WITH THE CLI, at `local-page/` beside the bundle. A CLI built without it
 * (the page is built by another repository) has none: `pageFolder()` answers nothing and the
 * command says so instead of serving an empty site.
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { ENDED_ON_FILE, SCREEN_FILE } from './localCaptures';

/** What a server shows: the page, the report it polls and the folder the pictures are kept in. */
export type Site = {
  pageFolder: string;
  /**
   * `.sherlo/captures/`: `/data/pictures/<folder>.png` is `<folder>/screen.png` in it, and
   * `/data/pictures/<folder>.ended.png` is `<folder>/ended-on.png`, the frame a stopped scene ended on.
   */
  capturesFolder: string;
  /** The report as it is now; read again on every request. */
  report: () => unknown;
};

/** A server that is up. `stopped` settles when it ends: Ctrl+C was pressed, or `stop()` ran. */
export type RunningServer = { address: string; stopped: Promise<void>; stop(): void };

export type LocalServer = {
  /** The folder the review page is shipped in, or nothing when this CLI was built without it. */
  pageFolder(): string | undefined;
  serve(site: Site): Promise<RunningServer>;
};

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const PICTURE_ROUTE = /^\/data\/pictures\/([\w.-]+?)(\.ended)?\.png$/;

/** The shipped answer. The page sits beside the bundle (`dist/local-page`). */
export const liveLocalServer: LocalServer = {
  pageFolder: () => {
    const folder = path.join(__dirname, 'local-page');
    return fs.existsSync(path.join(folder, 'index.html')) ? folder : undefined;
  },

  serve: (site) =>
    new Promise((resolve, reject) => {
      const server = http.createServer((request, response) => answer(site, request, response));
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (address === null || typeof address === 'string') {
          reject(new Error('The local server has no address'));
          return;
        }

        let stop = () => {};
        const stopped = new Promise<void>((settled) => {
          stop = () => {
            process.off('SIGINT', stop);
            process.off('SIGTERM', stop);
            server.close(() => settled());
            // A page that keeps polling holds the server open; Node 18.2 and later can drop it.
            (server as { closeAllConnections?: () => void }).closeAllConnections?.();
          };
        });
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
        // The address the server listens on, spelled as it is: `localhost` may mean `::1`.
        resolve({ address: `http://127.0.0.1:${address.port}`, stopped, stop: () => stop() });
      });
    }),
};

/** What one request gets: the report, a picture, or a file of the page. */
function answer(site: Site, request: http.IncomingMessage, response: http.ServerResponse): void {
  const requested = decodeRoute(request.url ?? '/');

  if (requested === '/data/report.json') {
    try {
      send(response, 200, '.json', Buffer.from(JSON.stringify(site.report())));
    } catch {
      // The report could not be built this time; the page polls again in a second.
      send(response, 503, '.html', Buffer.from('The report is not readable right now'));
    }
    return;
  }

  const picture = requested && PICTURE_ROUTE.exec(requested);
  if (picture) {
    sendFile(
      response,
      path.join(site.capturesFolder, picture[1], picture[2] ? ENDED_ON_FILE : SCREEN_FILE),
      site.capturesFolder
    );
    return;
  }

  if (requested === undefined) {
    send(response, 404, '.html', Buffer.from('Not found'));
    return;
  }
  sendFile(
    response,
    path.join(site.pageFolder, requested === '/' ? 'index.html' : requested),
    site.pageFolder
  );
}

/** The path of a request without its query, or nothing when it cannot be read as a path. */
function decodeRoute(url: string): string | undefined {
  try {
    return decodeURIComponent(new URL(url, 'http://localhost').pathname);
  } catch {
    return undefined;
  }
}

/** Send a file, if it is inside `folder`; anything else is a 404. */
function sendFile(response: http.ServerResponse, file: string, folder: string): void {
  const inside = path.relative(folder, path.resolve(file));
  if (inside.startsWith('..') || path.isAbsolute(inside)) {
    send(response, 404, '.html', Buffer.from('Not found'));
    return;
  }

  try {
    send(response, 200, path.extname(file), fs.readFileSync(file));
  } catch {
    send(response, 404, '.html', Buffer.from('Not found'));
  }
}

function send(
  response: http.ServerResponse,
  status: number,
  extension: string,
  body: Buffer
): void {
  response.writeHead(status, {
    'Content-Type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
    // The report and the pictures change under the page; it must always ask again.
    'Cache-Control': 'no-store',
  });
  response.end(body);
}

let installed: LocalServer = liveLocalServer;

/** The local server in force. */
export function localServer(): LocalServer {
  return installed;
}

/** Install a server for the duration of one posed run; the returned function undoes it. */
export function installLocalServer(next: LocalServer): () => void {
  const previous = installed;
  installed = next;
  return () => {
    installed = previous;
  };
}

/* ========================================================================== */
/* The posed server                                                           */
/* ========================================================================== */

/** What the server did when the report was opened, as a pose states it. */
export type PosedLocalServer = {
  /** The port the server answered on; the address the command prints is `http://127.0.0.1:<port>`. */
  port: number;
};

/** An act the pose could not answer, and the reason - recorded the way an unscripted call is. */
export type UnansweredLocalServer = { call: string; problem: string };

/**
 * The server a pose declares. Nothing listens; it answers at once and its `stopped` is already
 * settled, so the command ends the way it does when the person presses Ctrl+C. A command that
 * reaches the server with no `localServer` in its pose is RECORDED as a refusal, not thrown.
 */
export function posedLocalServer(
  posed: PosedLocalServer | undefined
): LocalServer & { refusals(): UnansweredLocalServer[] } {
  const refusals: UnansweredLocalServer[] = [];

  return {
    refusals: () => refusals,

    // A machine that only has the pose has the page it was built with.
    pageFolder: () => '<local-page>',

    serve: async (site) => {
      // The report is built once, as the page's first read would: a report that cannot be built is a fault here too.
      site.report();
      if (!posed) {
        refusals.push({
          call: 'serveLocalPage',
          problem:
            'the pose states no `localServer`, and the command served the page - say which port',
        });
        return { address: 'http://127.0.0.1:0', stopped: Promise.resolve(), stop: () => {} };
      }
      return {
        address: `http://127.0.0.1:${posed.port}`,
        stopped: Promise.resolve(),
        stop: () => {},
      };
    },
  };
}
