import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./adb.js', () => ({
  shell: vi.fn(),
}));

import * as adb from './adb.js';
import {
  readFile,
  writeFile,
  appendFile,
  deleteFile,
  readJsonLines,
  tailFile,
} from './device-files.js';

const mockShell = vi.mocked(adb.shell);
const SERIAL = 'emulator-5554';
const PKG = 'com.example.app';

beforeEach(() => {
  vi.resetAllMocks();
});

// ── readFile() ───────────────────────────────────────────────────────────────

describe('readFile()', () => {
  it('calls run-as cat with the correct device path', () => {
    mockShell.mockReturnValue('{"key":"value"}');
    const result = readFile(SERIAL, PKG, 'config.sherlo');
    expect(mockShell).toHaveBeenCalledWith(
      SERIAL,
      `run-as ${PKG} cat /data/data/${PKG}/files/sherlo/config.sherlo`,
    );
    expect(result).toBe('{"key":"value"}');
  });
});

// ── writeFile() ──────────────────────────────────────────────────────────────

describe('writeFile()', () => {
  it('builds the right adb shell command using base64 encoding', () => {
    mockShell.mockReturnValue('');
    writeFile(SERIAL, PKG, 'config.sherlo', 'hello world');
    const b64 = Buffer.from('hello world').toString('base64');
    expect(mockShell).toHaveBeenCalledWith(
      SERIAL,
      `run-as ${PKG} sh -c 'mkdir -p /data/data/${PKG}/files/sherlo && echo ${b64} | base64 -d > /data/data/${PKG}/files/sherlo/config.sherlo'`,
    );
  });

  it('handles JSON content without escaping issues', () => {
    mockShell.mockReturnValue('');
    const json = '{"token":"abc123","url":"https://example.com"}';
    writeFile(SERIAL, PKG, 'protocol.sherlo', json);
    const b64 = Buffer.from(json).toString('base64');
    expect(mockShell).toHaveBeenCalledWith(
      SERIAL,
      `run-as ${PKG} sh -c 'mkdir -p /data/data/${PKG}/files/sherlo && echo ${b64} | base64 -d > /data/data/${PKG}/files/sherlo/protocol.sherlo'`,
    );
  });
});

// ── appendFile() ─────────────────────────────────────────────────────────────

describe('appendFile()', () => {
  it('uses >> redirection for append', () => {
    mockShell.mockReturnValue('');
    appendFile(SERIAL, PKG, 'log.sherlo', 'new line');
    const b64 = Buffer.from('new line').toString('base64');
    expect(mockShell).toHaveBeenCalledWith(
      SERIAL,
      `run-as ${PKG} sh -c 'mkdir -p /data/data/${PKG}/files/sherlo && echo ${b64} | base64 -d >> /data/data/${PKG}/files/sherlo/log.sherlo'`,
    );
  });
});

// ── deleteFile() ─────────────────────────────────────────────────────────────

describe('deleteFile()', () => {
  it('calls run-as rm with the correct device path', () => {
    mockShell.mockReturnValue('');
    deleteFile(SERIAL, PKG, 'config.sherlo');
    expect(mockShell).toHaveBeenCalledWith(
      SERIAL,
      `run-as ${PKG} rm -f /data/data/${PKG}/files/sherlo/config.sherlo`,
    );
  });
});

// ── readJsonLines() ──────────────────────────────────────────────────────────

describe('readJsonLines()', () => {
  it('parses all valid JSON lines', () => {
    mockShell.mockReturnValue('{"a":1}\n{"b":2}\n{"c":3}');
    expect(readJsonLines(SERIAL, PKG, 'log.sherlo')).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
  });

  it('skips empty lines', () => {
    mockShell.mockReturnValue('{"a":1}\n\n\n{"b":2}');
    expect(readJsonLines(SERIAL, PKG, 'log.sherlo')).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('skips lines that fail to parse', () => {
    mockShell.mockReturnValue('{"a":1}\nbad json\nnot-json-either\n{"b":2}');
    expect(readJsonLines(SERIAL, PKG, 'log.sherlo')).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('returns empty array when all lines are invalid', () => {
    mockShell.mockReturnValue('oops\nalso bad');
    expect(readJsonLines(SERIAL, PKG, 'log.sherlo')).toEqual([]);
  });

  it('returns empty array for empty file', () => {
    mockShell.mockReturnValue('');
    expect(readJsonLines(SERIAL, PKG, 'log.sherlo')).toEqual([]);
  });
});

// ── tailFile() ───────────────────────────────────────────────────────────────

describe('tailFile()', () => {
  it('returns all lines and correct token when no since provided', () => {
    mockShell.mockReturnValue('line1\nline2\nline3');
    const result = tailFile(SERIAL, PKG, 'log.sherlo');
    expect(result.lines).toEqual(['line1', 'line2', 'line3']);
    expect(result.token.byteOffset).toBe(Buffer.byteLength('line1\nline2\nline3', 'utf8'));
  });

  it('returns only lines added since the token', () => {
    const previousContent = 'line1\nline2';
    const fullContent = 'line1\nline2\nline3\nline4';
    mockShell.mockReturnValue(fullContent);

    const since = { byteOffset: Buffer.byteLength(previousContent, 'utf8') };
    const result = tailFile(SERIAL, PKG, 'log.sherlo', since);

    expect(result.lines).toEqual(['line3', 'line4']);
    expect(result.token.byteOffset).toBe(Buffer.byteLength(fullContent, 'utf8'));
  });

  it('returns empty lines array when file has not grown', () => {
    const content = 'line1\nline2';
    mockShell.mockReturnValue(content);

    const since = { byteOffset: Buffer.byteLength(content, 'utf8') };
    const result = tailFile(SERIAL, PKG, 'log.sherlo', since);

    expect(result.lines).toEqual([]);
    expect(result.token.byteOffset).toBe(Buffer.byteLength(content, 'utf8'));
  });

  it('advances the token to the full file byte length', () => {
    mockShell.mockReturnValue('alpha\nbeta');
    const { token } = tailFile(SERIAL, PKG, 'log.sherlo');
    expect(token.byteOffset).toBe(Buffer.byteLength('alpha\nbeta', 'utf8'));
  });
});
