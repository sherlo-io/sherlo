import { NativeModules, TurboModule, TurboModuleRegistry } from 'react-native';

/**
 * The address of the bundler this app's JavaScript came from, or null when it did not come from
 * one. React Native names that bundler in the url it loaded the bundle from; a built app names a
 * file on the device instead, and a file has no bundler.
 */
export function bundlerOrigin(): string | null {
  // React Native's own dev tools (getDevServer) read the SourceCode TurboModule; a dev client in
  // the new architecture may have no NativeModules entry, so that is asked first.
  type SourceCode = { getConstants?: () => { scriptURL?: string }; scriptURL?: string };
  const sourceCode =
    TurboModuleRegistry.get<SourceCode & TurboModule>('SourceCode') ??
    (NativeModules.SourceCode as SourceCode | undefined);
  const scriptURL = sourceCode?.getConstants?.().scriptURL ?? sourceCode?.scriptURL;
  if (typeof scriptURL !== 'string') return null;

  const origin = /^(https?:\/\/[^/]+)/.exec(scriptURL);
  return origin ? origin[1] : null;
}

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]', '10.0.2.2'];

/**
 * Whether the url is a socket the bundler's dev tools open (hot reload at /hot, /message, the
 * inspector): the bundler's own port, on its host or another spelling of this machine (localhost,
 * 127.0.0.1, the Android emulator's 10.0.2.2). Another port or another host is the app's own.
 */
export function isBundlerSocketUrl(url: string): boolean {
  const origin = bundlerOrigin();
  if (!origin) return false;
  const socket = /^(?:wss?|https?):\/\/([^/?#]+)/.exec(url)?.[1]?.toLowerCase();
  if (!socket) return false;
  const bundler = origin.replace(/^https?:\/\//, '').toLowerCase();
  if (socket === bundler) return true;

  const split = (address: string) => /^(.*?)(?::(\d+))?$/.exec(address) as RegExpExecArray;
  const [, socketHost, socketPort] = split(socket);
  const [, bundlerHost, bundlerPort] = split(bundler);
  return (
    socketPort === bundlerPort &&
    LOOPBACK_HOSTS.includes(socketHost) &&
    LOOPBACK_HOSTS.includes(bundlerHost)
  );
}

/**
 * Whether `url` is an asset the bundler itself serves: a file of the app, no network image. The
 * bundler's origin is the app's own side.
 */
export function isBundlerAssetUrl(url: string): boolean {
  const origin = bundlerOrigin();
  return origin !== null && url.startsWith(`${origin}/assets/`);
}
