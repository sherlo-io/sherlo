/**
 * `2026-08-18T09:00:00Z` -> `7 minutes ago`.
 *
 * `now` IS A PARAMETER, NOT A `new Date()`. This phrase is the only place the
 * push transcript reads a wall clock, and a clock on a render path makes a
 * fixture unreproducible: the same scripted state would render "7 minutes ago"
 * today and "3 weeks ago" next month, so the two-pass determinism check would
 * pass (it agrees with itself within one process) while the byte ratchet drifted
 * out from under it. The real CLI passes `new Date()`; an expectation producer
 * passes the instant its scenario declares.
 */
function getTimeAgo(dateString: string, now: Date = new Date()): string {
  const date = new Date(dateString);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  const intervals = { year, month, week, day, hour, minute, second } as const;

  for (const [unit, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit);

    if (interval >= 1) {
      return `${interval} ${unit}${interval === 1 ? '' : 's'} ago`;
    }
  }

  return 'just now';
}

export default getTimeAgo;

const second = 1;
const minute = second * 60;
const hour = minute * 60;
const day = hour * 24;
const week = day * 7;
const month = week * 4;
const year = month * 12;
