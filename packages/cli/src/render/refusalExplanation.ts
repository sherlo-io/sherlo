/**
 * A SCENE THAT NEVER GOT READY, EXPLAINED BY THE REQUESTS IT WAS REFUSED.
 *
 * Pure: the record's refused requests in, the words out. A scene can be refused hundreds of
 * requests (one SDK retrying its own host), and the error that ended it names only the first. So
 * the requests are counted by address (retries folded), the likely cause is picked by rule, and
 * each cause brings the fake that answers it, as a line to paste, like the discover list's.
 *
 * The rules, in order, each stands alone and all that trip are printed:
 * - an online check was refused (NetInfo's generate_204): the app thinks it is offline;
 * - the app's own API was refused (a GraphQL operation, or an address Sherlo does not know);
 * - three or more hosts of known vendor SDKs were refused: fake the services the app starts.
 */
import { kindOfAddress, senderOf, senderWords, vendorOf } from '../seams/requestSender';
import type { Sender } from '../seams/requestSender';
import type { UnansweredRequest } from '../seams/readAppAnswer';
import { ruleOf } from './mockRuleLine';
import { quoted } from './quotedText';

type Refused = UnansweredRequest;

/** The rule that blocked a request, in the words of the explanation; a fake that refused says where it was declared. */
function ruleWords({ rule, fakeAt }: Refused): string[] {
  if (rule === undefined) return [];
  // A request blocked below the JavaScript layer (a native rule, or the emulator's proxy) was one
  // no fake matched, as it was before native code named its rule: it keeps the same words.
  if (rule !== 'fake-refused') return ['no fake matched it'];
  const place = fakeAt === undefined || fakeAt === 'unknown' ? undefined : placeOf(fakeAt);
  return [`a fake of yours refused it (declared ${place ? `at ${place}` : 'somewhere unknown'})`];
}

/** The file and line of a call-stack frame: `at fake (/app/Home.stories.tsx:12:5)` gives `/app/Home.stories.tsx:12`. */
function placeOf(frame: string): string {
  return /([^\s()]+:\d+):\d+\)?$/.exec(frame)?.[1] ?? frame;
}

/** How many fakes one cause suggests before the rest is left out. */
const TOP_FAKES = 6;
/** Vendor hosts that make "the app starts many services". */
const MANY_VENDOR_HOSTS = 3;

export type AddressCount = {
  address: string;
  methods: string[];
  times: number;
  sender?: Sender;
};

export type RefusalCause = {
  id: 'thinks-offline' | 'own-api-refused' | 'vendor-sdks-starting';
  /** The cause in a few words, for a line that only names it. */
  short: string;
  words: string;
  fakes: string[];
  moreFakes: number;
  /** Who sent the requests behind this cause, each as `library` or `library (by its host)`. */
  senders: string[];
  /** The rules that blocked them, in words. */
  rules: string[];
};

export type RefusalExplanation = {
  total: number;
  addresses: AddressCount[];
  causes: RefusalCause[];
};

/** An address with the query dropped and every id-like path piece named `:id`, so retries with new ids fold. */
function addressOf(url: string): string {
  const [withoutQuery] = url.split(/[?#]/);
  const match = /^([a-z][a-z0-9+.-]*:\/\/[^/]+)(.*)$/i.exec(withoutQuery);
  if (!match) return withoutQuery;
  const path = match[2]
    .split('/')
    .map((piece) =>
      /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(piece) ||
      /^\d{3,}$/.test(piece) ||
      /^[0-9a-f]{24,}$/i.test(piece)
        ? ':id'
        : piece
    )
    .join('/');
  return `${match[1]}${path}`;
}

/** The refused requests counted by address, most asked first. */
function countByAddress(refused: Refused[]): AddressCount[] {
  const counts = new Map<string, AddressCount>();
  for (const request of refused) {
    const address = addressOf(request.url);
    const kept = counts.get(address) ?? { address, methods: [], times: 0 };
    kept.times += 1;
    if (!kept.methods.includes(request.method)) kept.methods.push(request.method);
    kept.sender ??= senderOf(request);
    counts.set(address, kept);
  }
  return [...counts.values()].sort((a, b) => b.times - a.times);
}

/** What a cause shows of the requests behind it: its fakes, who sent them and the rule that blocked them. */
function causeDetails(
  fakes: string[],
  requests: Refused[]
): Pick<RefusalCause, 'fakes' | 'moreFakes' | 'senders' | 'rules'> {
  const senders = requests.flatMap((request) => {
    const sender = senderOf(request);
    return sender ? [senderWords(sender)] : [];
  });
  const rules = requests.flatMap(ruleWords);
  return {
    fakes: fakes.slice(0, TOP_FAKES),
    moreFakes: Math.max(0, fakes.length - TOP_FAKES),
    senders: [...new Set(senders)],
    rules: [...new Set(rules)],
  };
}

function originOf(url: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\/[^/?#]+/i.exec(url)?.[0] ?? url;
}

/** The likely causes of a scene's refusals, by rule; none when the requests trip none. */
function causesOf(refused: Refused[]): RefusalCause[] {
  const causes: RefusalCause[] = [];

  const checkRequests = refused.filter(({ url }) => kindOfAddress(url) === 'online-check');
  const checks = [...new Set(checkRequests.map(({ url }) => addressOf(url)))];
  if (checks.length > 0) {
    causes.push({
      id: 'thinks-offline',
      short: 'the app thinks it is offline',
      words:
        'The app thinks it is offline: it asked an online check (the address a network-status library such as NetInfo asks) and got no answer. Answer the check:',
      ...causeDetails(
        checks.map((url) => `mockRequest({ url: ${quoted(url)} }, { status: 204 })`),
        checkRequests
      ),
    });
  }

  const own = refused.filter(
    ({ url, operation }) => operation !== undefined || kindOfAddress(url) === undefined
  );
  if (own.length > 0) {
    const rules = new Map<string, string>();
    for (const request of own) {
      const rule = ruleOf({ ...request, url: addressOf(request.url) });
      if (!rules.has(rule)) rules.set(rule, rule);
    }
    causes.push({
      id: 'own-api-refused',
      short: "the app's own API was refused",
      words:
        "The app's own API was refused (a GraphQL operation, or an address that is no known online check or SDK). Answer what the scene reads from it:",
      ...causeDetails([...rules.values()], own),
    });
  }

  const vendorRequests = refused.filter(({ url }) => kindOfAddress(url) === 'vendor-sdk');
  const vendorHosts = [...new Set(vendorRequests.map(({ url }) => originOf(url)))];
  if (vendorHosts.length >= MANY_VENDOR_HOSTS) {
    const vendors = [
      ...new Set(refused.map(({ url }) => vendorOf(url)).filter((name) => name !== undefined)),
    ];
    causes.push({
      id: 'vendor-sdks-starting',
      short: 'the services the app starts were refused',
      words: `${vendorHosts.length} hosts of SDKs the app starts (${vendors.join(', ')}) were refused. Fake the services the app starts:`,
      ...causeDetails(
        vendorHosts.map((origin) => `mockRequest({ url: ${quoted(`${origin}/*`)} }, { body: {} })`),
        vendorRequests
      ),
    });
  }

  return causes;
}

/** What the refused requests say about the scene; nothing when none was refused. */
export function explainRefusals(refused: Refused[] | undefined): RefusalExplanation | undefined {
  if (!refused || refused.length === 0) return undefined;
  return {
    total: refused.length,
    addresses: countByAddress(refused),
    causes: causesOf(refused),
  };
}
