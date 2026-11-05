/**
 * THE LINES FOR A SCENE REFUSED MANY REQUESTS, from the explanation in ./refusalExplanation.
 *
 * Pure: the record's refused requests in, the lines out.
 */
import chalk from 'chalk';
import { explainRefusals } from './refusalExplanation';
import type { AddressCount } from './refusalExplanation';

/** Fewer refused requests than this are listed one by one, as ever. */
const MANY_REQUESTS = 10;
/** How many addresses are listed before the rest is summed. */
const TOP_ADDRESSES = 5;

function addressLine({ address, methods, times, sender }: AddressCount): string {
  const from = sender
    ? ` from ${sender.library}${sender.how === 'host' ? ' (by its host)' : ''}`
    : '';
  return `     ${String(times).padStart(4)}  ${methods.join('/')} ${address}${from}`;
}

/**
 * The lines for a scene refused many requests: the addresses counted, the likely causes and the
 * fakes. Nothing when only a few were refused, which the plain list tells better.
 */
export function refusalLines(refused: Parameters<typeof explainRefusals>[0]): string[] | undefined {
  if (!refused || refused.length < MANY_REQUESTS) return undefined;
  const explanation = explainRefusals(refused);
  if (!explanation) return undefined;
  const { total, addresses, causes } = explanation;
  const top = addresses.slice(0, TOP_ADDRESSES);
  const rest = addresses.slice(TOP_ADDRESSES);
  const restTimes = rest.reduce((sum, { times }) => sum + times, 0);
  return [
    '',
    `${chalk.yellow('◦')}  ${total} requests had no mock, to ${addresses.length} ${addresses.length === 1 ? 'address' : 'addresses'} (asks to one address counted together):`,
    ...top.map(addressLine),
    ...(rest.length > 0
      ? [
          `     ${String(restTimes).padStart(4)}  more, to ${rest.length} other ${rest.length === 1 ? 'address' : 'addresses'}`,
        ]
      : []),
    ...causes.flatMap(({ words, fakes, moreFakes }) => [
      '',
      `  ${words}`,
      ...fakes.map((fake) => `     ${fake}`),
      ...(moreFakes > 0 ? [`     ... and ${moreFakes} more like these`] : []),
    ]),
  ];
}
