import { RequestAnswer } from './networkDeclaration';
import { answerFor, bodyOf, delay, statusOf } from './networkRules';

/**
 * THE XMLHttpRequest HALF OF THE INTERCEPTOR - the same rules, delivered the way a real request
 * delivers them: the readyState / status / responseText sequence, and the events that go with it.
 *
 * It is the REAL XMLHttpRequest with two methods replaced, so everything a library sets up before
 * sending (request headers, responseType, listeners, timeouts) keeps working untouched, and a
 * request the story let through is sent by the real thing. A request the rules answer never
 * reaches `send`, so nothing leaves the device.
 */

/** The parts of XMLHttpRequest this wrapper reads, writes, or hands back to the caller. */
interface Xhr {
  readyState: number;
  status: number;
  statusText: string;
  responseText: string;
  response: unknown;
  responseType: string;
  open(method: string, url: string, ...rest: unknown[]): void;
  send(body?: unknown): void;
  getResponseHeader(name: string): string | null;
  getAllResponseHeaders(): string;
  dispatchEvent?: (event: unknown) => boolean;
}

export type XhrClass = new () => Xhr;

/** The readyState values a request passes through, named the way XMLHttpRequest names them. */
const HEADERS_RECEIVED = 2;
const LOADING = 3;
const DONE = 4;

export function mockedXhrOf(RealXhr: XhrClass): XhrClass {
  return class SherloMockedXhr extends RealXhr {
    private request: { method: string; url: string } = { method: 'GET', url: '' };
    private answeredHeaders: Record<string, string> | null = null;

    open(method: string, url: string, ...rest: unknown[]): void {
      this.request = { method: String(method).toUpperCase(), url: String(url) };
      super.open(method, url, ...rest);
    }

    send(body?: unknown): void {
      const verdict = answerFor({
        ...this.request,
        body: typeof body === 'string' ? body : undefined,
      });

      // The two mocked branches are deliberately not awaited: a real send() returns at once and
      // answers later, so a caller that awaited this one would be waiting on a request that is
      // already on its way back.
      if (verdict.kind === 'passthrough') super.send(body);
      else if (verdict.kind === 'answer') this.answer(verdict.answer);
      else this.refuse();
    }

    getResponseHeader(name: string): string | null {
      if (!this.answeredHeaders) return super.getResponseHeader(name);

      const match = Object.keys(this.answeredHeaders).find(
        (header) => header.toLowerCase() === name.toLowerCase()
      );
      return match ? this.answeredHeaders[match] : null;
    }

    getAllResponseHeaders(): string {
      if (!this.answeredHeaders) return super.getAllResponseHeaders();

      const headers = this.answeredHeaders;
      return Object.keys(headers)
        .map((header) => `${header.toLowerCase()}: ${headers[header]}\r\n`)
        .join('');
    }

    private async answer(answer: RequestAnswer): Promise<void> {
      await delay(answer.delayMs);

      const { text, headers } = bodyOf(answer);
      this.answeredHeaders = headers;

      this.settle({ readyState: HEADERS_RECEIVED, status: statusOf(answer), statusText: '' });
      this.emit('readystatechange');

      this.settle({ readyState: LOADING, responseText: text, response: responseOf(this, text) });
      this.emit('readystatechange');

      this.settle({ readyState: DONE });
      this.emit('readystatechange');
      this.emit('load');
      this.emit('loadend');
    }

    /**
     * A refused request ends the way a request that never reached anyone ends - status 0 and an
     * error event - so whatever the app draws for a failed request is what the screen shows. The
     * refusal itself was already recorded against the story by answerFor.
     */
    private async refuse(): Promise<void> {
      await delay();

      this.settle({ readyState: DONE, status: 0, statusText: '', responseText: '', response: '' });
      this.emit('readystatechange');
      this.emit('error');
      this.emit('loadend');
    }

    /**
     * Write what a real request would have written. XMLHttpRequest publishes these as read-only
     * properties of its prototype, so each one is defined on THIS instance, where it shadows the
     * prototype's - the only way to hand the caller a value it can simply read.
     */
    private settle(fields: Record<string, unknown>): void {
      Object.keys(fields).forEach((field) => {
        Object.defineProperty(this, field, {
          value: fields[field],
          configurable: true,
          enumerable: true,
          writable: true,
        });
      });
    }

    /** Fire one event, to the `on<name>` handler and to any listener that was added. */
    private emit(type: string): void {
      // Where dispatching works, dispatching IS firing the event: a real XMLHttpRequest reaches
      // the `on<name>` handler and every added listener through it, so calling the handler as
      // well would fire it twice.
      try {
        if (typeof this.dispatchEvent === 'function') {
          this.dispatchEvent(eventOf(type, this));
          return;
        }
      } catch (_) {
        // React Native's XMLHttpRequest accepts only its own private Event class and refuses
        // anything else, and a runtime may have no XMLHttpRequest events at all - there the
        // handler below is the whole of firing the event.
      }

      const handler = (this as unknown as Record<string, unknown>)[`on${type}`];
      if (typeof handler === 'function') {
        (handler as (fired: unknown) => void).call(this, { type, target: this });
      }
    }
  };
}

/** The event to dispatch: a real one where the runtime has the class, a plain one otherwise. */
function eventOf(type: string, target: Xhr): unknown {
  const RuntimeEvent = (globalThis as { Event?: new (eventType: string) => unknown }).Event;
  return typeof RuntimeEvent === 'function' ? new RuntimeEvent(type) : { type, target };
}

/** What `response` holds: the parsed body for a caller that asked for JSON, the text otherwise. */
function responseOf(xhr: Xhr, text: string): unknown {
  if (xhr.responseType !== 'json') return text;

  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}
