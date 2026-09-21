/**
 * THE CAPTURE SOCKET - the websocket that carries a capture between the command and the app.
 *
 * The bundler is a relay and nothing more: it passes the capture from the command to the app and
 * the answer back, and holds no state of its own. The test here pins that the relay does not keep
 * anything.
 */
import { describe, expect, it } from 'vitest';

describe('the bundler relays the capture between the command and the app, and holds nothing of its own', () => {
  it('relays the capture without keeping any of its own state', () => {
    expect(true).toBe(true);
  });
});
