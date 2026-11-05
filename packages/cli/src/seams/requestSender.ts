/**
 * WHO SENT A REQUEST NO MOCK ANSWERED, as far as it can be known.
 *
 * The call stack names the package when JavaScript sent the request (the SDK reads it, and the
 * record keeps it as `library`). A request an SDK sends from native code (a URLSession or an OkHttp
 * client inside the SDK's own native library) has no JavaScript stack: the app learns of it as an
 * event, so no package can be read off it, and none is ever made up. The next best signal is the
 * host: a table of hosts that belong to well-known SDKs says which package the request most
 * probably came from. That answer is a guess and is told as one (`how: 'host'`).
 */

/** What kind of address a known host is. */
export type HostKind = 'online-check' | 'vendor-sdk' | 'utility';

type KnownHost = {
  /** The host, or the end of one: `adapty.io` is every `*.adapty.io`. */
  suffix: string;
  kind: HostKind;
  /** The npm package that most probably sends requests to it. */
  library?: string;
  /** A label for the vendor in the words of the explanation. */
  vendor?: string;
};

/** Public knowledge: the endpoints these SDKs document or are known to use. */
const KNOWN_HOSTS: KnownHost[] = [
  { suffix: 'adapty.io', kind: 'vendor-sdk', library: 'react-native-adapty', vendor: 'Adapty' },
  {
    suffix: 'appsflyersdk.com',
    kind: 'vendor-sdk',
    library: 'react-native-appsflyer',
    vendor: 'AppsFlyer',
  },
  {
    suffix: 'amplitude.com',
    kind: 'vendor-sdk',
    library: '@amplitude/analytics-react-native',
    vendor: 'Amplitude',
  },
  {
    suffix: 'facebook.com',
    kind: 'vendor-sdk',
    library: 'react-native-fbsdk-next',
    vendor: 'the Facebook SDK',
  },
  { suffix: 'braze.eu', kind: 'vendor-sdk', library: '@braze/react-native-sdk', vendor: 'Braze' },
  { suffix: 'braze.com', kind: 'vendor-sdk', library: '@braze/react-native-sdk', vendor: 'Braze' },
  {
    suffix: 'firebaseinstallations.googleapis.com',
    kind: 'vendor-sdk',
    library: '@react-native-firebase/app',
    vendor: 'Firebase',
  },
  { suffix: 'api.segment.io', kind: 'vendor-sdk', library: '@segment/analytics-react-native' },
  { suffix: 'ingest.sentry.io', kind: 'vendor-sdk', library: '@sentry/react-native' },
  { suffix: 'api.ipify.org', kind: 'utility' },
  { suffix: 'connectivitycheck.gstatic.com', kind: 'online-check' },
  { suffix: 'captive.apple.com', kind: 'online-check' },
];

/** An address a NetInfo-style reachability check asks: it answers 204 and says nothing else. */
const ONLINE_CHECK_PATH = /\/generate_204$/;

/** The lower-case host of an address; nothing when it has none. */
export function hostOf(url: string): string | undefined {
  return /^[a-z][a-z0-9+.-]*:\/\/([^/?#:]+)/i.exec(url)?.[1]?.toLowerCase();
}

function knownHostOf(url: string): KnownHost | undefined {
  const host = hostOf(url);
  if (host === undefined) return undefined;
  return KNOWN_HOSTS.find(({ suffix }) => host === suffix || host.endsWith(`.${suffix}`));
}

/** What kind of address this is, when Sherlo knows it. */
export function kindOfAddress(url: string): HostKind | undefined {
  if (ONLINE_CHECK_PATH.test(url.split(/[?#]/)[0])) return 'online-check';
  return knownHostOf(url)?.kind;
}

/** The SDK's name for a known vendor host, for the explanation's words. */
export function vendorOf(url: string): string | undefined {
  const known = knownHostOf(url);
  return known?.kind === 'vendor-sdk' ? (known.vendor ?? known.library) : undefined;
}

/** Records made before the SDK skipped compiler helpers name one of these; it made no request. */
const COMPILER_HELPERS = new Set(['@babel/runtime', 'tslib', '@swc/helpers', 'core-js']);

/**
 * Whether the library came off the call stack (sure), off a package whose code holds the host
 * (see ./senderByCode; a guess), or off the host table (a guess).
 */
export type Sender = { library: string; how: 'stack' | 'code' | 'host' };

/** A sender in words: the package, and how it was found when that was a guess. */
export function senderWords({ library, how }: Sender): string {
  if (how === 'code') return `${library} (its code names the host)`;
  return how === 'host' ? `${library} (by its host)` : library;
}

/** Packages whose frames sit between any request and its sender: Sherlo's wrappers and React Native's own fetch. */
const PLUMBING = /^(@sherlo\/|react-native$|whatwg-fetch$|promise$|abort-controller$)/;

/** Whether a package only carries requests (a compiler helper, Sherlo's wrappers, React Native's fetch): it sends none of its own. */
export function isRequestPlumbing(name: string): boolean {
  return COMPILER_HELPERS.has(name) || PLUMBING.test(name);
}

/** The first package on a call stack that is neither a compiler helper nor request plumbing. */
function packageOnStack(stack: string): string | undefined {
  for (const [, name] of stack.matchAll(/node_modules\/((?:@[^/\s:]+\/)?[^/\s:]+)\//g)) {
    if (!isRequestPlumbing(name)) return name;
  }
  return undefined;
}

/**
 * The package a request came from: the one its call stack names (or the record already names), else
 * the one whose code holds its host (found on the Mac), else the one the host table names for a
 * known SDK host. Nothing when none knows.
 */
export function senderOf(request: {
  url: string;
  library?: string;
  stack?: string;
  codeNames?: string;
}): Sender | undefined {
  const named = request.library ?? (request.stack ? packageOnStack(request.stack) : undefined);
  if (named !== undefined && !COMPILER_HELPERS.has(named)) {
    return { library: named, how: 'stack' };
  }
  if (request.codeNames !== undefined) return { library: request.codeNames, how: 'code' };
  const library = knownHostOf(request.url)?.library;
  return library === undefined ? undefined : { library, how: 'host' };
}
