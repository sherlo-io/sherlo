import type { DeviceSerial } from './adb.js';
import { shell } from './adb.js';

export type ProtocolFile = 'config.sherlo' | 'log.sherlo' | 'protocol.sherlo' | 'config.sherlo.sig';

export interface TailToken {
  byteOffset: number;
}

function devicePath(pkg: string, file: ProtocolFile): string {
  return `/data/data/${pkg}/files/sherlo/${file}`;
}

function parentDir(pkg: string): string {
  return `/data/data/${pkg}/files/sherlo`;
}

export function readFile(serial: DeviceSerial, pkg: string, file: ProtocolFile): string {
  return shell(serial, `run-as ${pkg} cat ${devicePath(pkg, file)}`);
}

export function writeFile(
  serial: DeviceSerial, pkg: string, file: ProtocolFile, contents: string,
): void {
  const encoded = Buffer.from(contents).toString('base64');
  shell(serial, `run-as ${pkg} sh -c 'mkdir -p ${parentDir(pkg)} && echo ${encoded} | base64 -d > ${devicePath(pkg, file)}'`);
}

export function appendFile(
  serial: DeviceSerial, pkg: string, file: ProtocolFile, contents: string,
): void {
  const encoded = Buffer.from(contents).toString('base64');
  shell(serial, `run-as ${pkg} sh -c 'mkdir -p ${parentDir(pkg)} && echo ${encoded} | base64 -d >> ${devicePath(pkg, file)}'`);
}

export function deleteFile(serial: DeviceSerial, pkg: string, file: ProtocolFile): void {
  shell(serial, `run-as ${pkg} rm -f ${devicePath(pkg, file)}`);
}

export function readJsonLines(serial: DeviceSerial, pkg: string, file: ProtocolFile): any[] {
  const content = readFile(serial, pkg, file);
  return content
    .split('\n')
    .filter(line => line.trim() !== '')
    .flatMap(line => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

export function tailFile(
  serial: DeviceSerial,
  pkg: string,
  file: ProtocolFile,
  since?: TailToken,
): { lines: string[]; token: TailToken } {
  const content = readFile(serial, pkg, file);
  const byteOffset = since?.byteOffset ?? 0;
  const slice = Buffer.from(content, 'utf8').subarray(byteOffset).toString('utf8');
  const lines = slice.split('\n').filter(line => line.length > 0);
  const token: TailToken = { byteOffset: Buffer.byteLength(content, 'utf8') };
  return { lines, token };
}
