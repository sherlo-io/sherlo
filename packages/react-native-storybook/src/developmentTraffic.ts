/**
 * THE APP'S OWN DEVELOPMENT TRAFFIC - the connections a debug app opens itself, which are never a
 * screen's requests: loopback on the bundler's port, or on React DevTools' port. This file has no
 * React Native import, so the CLI reads the same names as the app (bundlerOrigin.ts uses them for
 * the socket hold; Android's SherloRequestKind.java names the same port).
 */

/** The names this machine goes by: itself, and the Android emulator's address for its host. */
export const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]', '10.0.2.2'];

/** The port a debug React Native app opens its React DevTools connection on. */
export const REACT_DEVTOOLS_PORT = 8097;

/** Whether `host` and `port` are on loopback at React DevTools' port. */
export function isReactDevToolsAddress(host: string, port: number): boolean {
  return LOOPBACK_HOSTS.includes(host.toLowerCase()) && port === REACT_DEVTOOLS_PORT;
}
