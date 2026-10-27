import base64 from 'base-64';
import utf8 from 'utf8';
import type { NetworkRule } from './networkDeclaration';
import { bodyOf, statusOf, urlPrefixOf } from './networkRules';
import { bundlerOrigin } from '../bundlerOrigin';
import SherloModule from '../SherloModule';
import NativeSherloModule from '../specs/NativeSherloModule';

/**
 * THE RULES, HANDED TO NATIVE CODE.
 *
 * fetch and XMLHttpRequest are answered in JavaScript (./networkFetch, ./networkXhr). A request a
 * native library makes itself - a picture downloaded to a file, an image view's own loader -
 * never passes through them, so the same rules are handed to native code, which answers a
 * matching request there:
 * - iOS (ios/SherloRequestAnswers): a URL protocol, registered globally and put first in every
 *   session configuration made from the default or the ephemeral one, from the launch of a test
 *   run or a debug build, else from the first rules handed over.
 * - Android (SherloRequestAnswers.java): an interceptor on every client React Native's
 *   OkHttpClientProvider makes, answering after the interceptors a library adds to it, and a
 *   loader put first in Glide's registry (SherloGlideAnswers.java).
 *
 * A request no native rule matches gets what fetch would in the same story: let through, held
 * for good (a discover launch), or refused - without the story being recorded as one that threw.
 * The bundler's own address is always let through.
 *
 * Rules that name a GraphQL operation, and every rule's delayMs, stay in JavaScript: native code
 * reads no request body and answers at once.
 *
 * Still out of native reach: on iOS, background sessions and sessions made from any other
 * configuration; on Android, a client factory the app sets itself, a client a library builds
 * itself outside Glide, and HttpURLConnection.
 */

/** One rule as native code reads it. */
interface NativeRule {
  method?: string;
  url?: { kind: 'exact' | 'prefix' | 'regex'; value: string; ignoreCase?: boolean };
  status: number;
  headers: Record<string, string>;
  bodyBase64: string;
}

/**
 * Put `rules` in effect in native code, a request no rule matches getting `unmatched`. An empty
 * list let through takes every native rule out.
 *
 * The app a customer ships hands nothing, not even an empty list: native code installs its
 * answering when rules first arrive (iOS replaces the session-configuration getters then).
 */
export function handRulesToNative(
  rules: NetworkRule[],
  unmatched: 'passthrough' | 'held' | 'refusal'
): void {
  const mode = SherloModule.getMode();
  if (mode !== 'testing' && mode !== 'storybook') return;

  const nativeRules = rules
    .filter((rule) => rule.matcher.operationName === undefined)
    .map(nativeRuleOf);
  const handed = { unmatched, bundlerOrigin: bundlerOrigin(), rules: nativeRules };

  // A native build from before the method has none, or may throw on it: either way fetch and
  // XMLHttpRequest still answer, so the story goes on without native answers.
  try {
    NativeSherloModule?.setNativeRequestAnswers?.(JSON.stringify(handed));
  } catch {
    return;
  }
}

function nativeRuleOf({ matcher, answer }: NetworkRule): NativeRule {
  const { text, headers } = bodyOf(answer);
  return {
    ...(matcher.method !== undefined && { method: matcher.method.toUpperCase() }),
    ...(matcher.url !== undefined && { url: nativeUrlOf(matcher.url) }),
    status: statusOf(answer),
    headers,
    bodyBase64: answer.bodyBase64 ?? base64.encode(utf8.encode(text)),
  };
}

function nativeUrlOf(pattern: string | RegExp): NativeRule['url'] {
  if (pattern instanceof RegExp) {
    return {
      kind: 'regex',
      value: pattern.source,
      ...(pattern.ignoreCase && { ignoreCase: true }),
    };
  }
  const prefix = urlPrefixOf(pattern);
  if (prefix !== undefined) return { kind: 'prefix', value: prefix };
  return { kind: 'exact', value: pattern };
}
