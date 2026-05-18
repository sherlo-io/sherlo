import { bootEmulator, type ManagedEmulator, ensureAvdExists } from './emulator.js';
import { getGlobalIosSimulator, shutdownGlobalIosSimulator } from './ios-simulator.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const PLATFORM = (process.env.PLATFORM ?? 'android') as 'android' | 'ios';
const HANDLE_FILE = path.join(__dirname, '..', '.global-emulator.json');

export default async function setup() {
  if (PLATFORM === 'ios') {
    const sim = getGlobalIosSimulator();
    console.log('Global iOS simulator ready: ' + sim.id);

    return async () => {
      console.log('Global iOS simulator shutting down: ' + sim.id);
      shutdownGlobalIosSimulator();
    };
  }

  ensureAvdExists();
  const emu: ManagedEmulator = await bootEmulator();
  fs.writeFileSync(HANDLE_FILE, JSON.stringify({ serial: emu.serial }));
  console.log('Global emulator booted: ' + emu.serial);

  return async () => {
    console.log('Global emulator shutting down: ' + emu.serial);
    await emu.shutdown();
    try { fs.unlinkSync(HANDLE_FILE); } catch {}
  };
}
