/** A DEVICE THE CATALOG HOLDS - its name and a system major it holds and one it lacks, read from the catalog alone. */
import { DEVICES } from '@sherlo/shared';

/** The Android API level of an Android major, from Android 13 on. */
export function apiLevelOf(androidMajor: number): number {
  return androidMajor + 20;
}

/** A catalog device's emulator name, a system major it holds (`held`) and the one above all it holds (`lacking`). */
export function catalogDevice(deviceId: keyof typeof DEVICES) {
  const device = DEVICES[deviceId];
  const majors = device.osVersions.map((supported) => Number(supported.version));
  return { emuName: device.emuName, held: majors[0], lacking: Math.max(...majors) + 1 };
}
