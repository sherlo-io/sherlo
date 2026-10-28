/**
 * THE ANDROID PHONES THE CAPTURE COUNTS - one entry per phone, and the one ANDROID_SERIAL names.
 *
 * `adb devices` can list one phone twice: an `emulator-5554` entry and an mDNS
 * `adb-...._adb-tls-connect._tcp` entry, or a USB serial and a wireless `ip:port` one. Each entry
 * is asked for its own serial number (`getprop ro.serialno`); entries that answer alike are one
 * phone, and the plain `emulator-NNNN` or USB entry is the one kept. A phone that does not answer
 * is kept as it is.
 */
import type { SceneDevice } from './deviceState';

type RunAdb = (tool: 'adb', args: string[], options?: { timeoutMs?: number }) => Promise<string>;

/** How long a phone has to say its own serial before it is taken as not answering. */
export const SERIAL_LOOKUP_LIMIT_MS = 5000;

/** The phone's own serial number, or undefined when it errors, says nothing, or is too slow. */
async function ownSerial(run: RunAdb, serial: string): Promise<string | undefined> {
  let timer: NodeJS.Timeout | undefined;
  const tooSlow = new Promise<string>((resolve) => {
    timer = setTimeout(() => resolve(''), SERIAL_LOOKUP_LIMIT_MS);
  });
  // The run is also told the limit, so a real adb that hangs is killed, not just left behind.
  const asked = run('adb', ['-s', serial, 'shell', 'getprop', 'ro.serialno'], {
    timeoutMs: SERIAL_LOOKUP_LIMIT_MS,
  }).catch(() => '');
  const answer = await Promise.race([asked, tooSlow]);
  clearTimeout(timer);
  return answer.trim().split('\n')[0]?.trim() || undefined;
}

/** A wireless entry: an mDNS name or an `ip:port`. */
function isWireless(serial: string): boolean {
  return serial.includes('_adb-tls-') || serial.includes(':');
}

/** Every connected Android phone once; when ANDROID_SERIAL is set, only the phone it names. */
export async function connectedAndroids(
  run: RunAdb,
  androidSerial = process.env.ANDROID_SERIAL
): Promise<SceneDevice[]> {
  try {
    const listed = await run('adb', ['devices']);
    const serials = listed
      .split('\n')
      .slice(1)
      .map((line) => line.trim().split(/\s+/))
      .filter(([serial, state]) => serial && state === 'device')
      .map(([serial]) => serial);

    // Plain entries first, so a plain entry is the one a wireless twin folds into.
    const ordered = [...serials.filter((s) => !isWireless(s)), ...serials.filter(isWireless)];
    const phones: Array<{ serial: string; own?: string; names: string[] }> = [];
    // Every entry is asked at once; one that does not answer in time is kept as it is.
    const answers = await Promise.all(ordered.map((serial) => ownSerial(run, serial)));
    for (const [index, serial] of ordered.entries()) {
      const own = answers[index];
      // Two plain entries are two phones (two emulators can share a serial number).
      const twin =
        own && isWireless(serial) ? phones.find((phone) => phone.own === own) : undefined;
      if (twin) twin.names.push(serial);
      else phones.push({ serial, own, names: [serial] });
    }

    const wanted = androidSerial ? phones.filter((p) => p.names.includes(androidSerial)) : phones;
    return wanted.map((phone) => ({ platform: 'android', serial: phone.serial }));
  } catch {
    // No Android tools on this machine: it has no emulator to clean.
    return [];
  }
}
