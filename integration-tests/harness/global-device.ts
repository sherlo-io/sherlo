import { PLATFORM } from './platform.js';
import { getGlobalEmulator } from './emulator.js';
import { getGlobalIosSimulator } from './ios-simulator.js';
import type { Device } from './device.js';

export function getGlobalDevice(): Device {
  return PLATFORM === 'ios' ? getGlobalIosSimulator() : getGlobalEmulator();
}
