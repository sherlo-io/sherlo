/**
 * The C core as the glue sees it: its one header, the core compiled for the machine running the
 * suite, and the stripped iOS and Android libraries read back with `nm`. Each name is a rule the
 * book marks on "The sealed core".
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ANDROID_ABIS,
  HEADER,
  LIBRARY_FILE_ANDROID,
  LIBRARY_FILE_IOS,
  buildAndroidCore,
  buildIosCore,
  coreVersion,
  findNdkTool,
  missingAndroidTools,
  missingIosTools,
} from '../build.js';
import { compileHostCore, removeHostCore, reportedAbi, reportedVersion } from './host/hostCore';

const headerText = fs.readFileSync(HEADER, 'utf8');
const headerWithoutComments = headerText.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** Every function the header declares: its name and the type of each parameter. */
function declaredFunctions(): Array<{ name: string; parameterTypes: string[] }> {
  const declaration = /([\w\s*]+?)\b(sherlo_\w+)\s*\(([^)]*)\)\s*;/g;
  const found: Array<{ name: string; parameterTypes: string[] }> = [];
  for (const match of headerWithoutComments.matchAll(declaration)) {
    const parameters = match[3].trim();
    const parameterTypes =
      parameters === 'void'
        ? []
        : parameters.split(',').map((parameter) =>
            // the type is everything but the parameter's own name
            parameter
              .trim()
              .replace(/\s*\b\w+$/, '')
              .replace(/\s+/g, ' ')
              .replace(/\s*\*/g, ' *')
              .trim()
          );
    found.push({ name: match[2], parameterTypes });
  }
  return found;
}

/** The names `nm` lists as defined and exported from a library. */
function exportedNames(nm: string[], library: string): string[] {
  const output = execFileSync(nm[0], [...nm.slice(1), library], { encoding: 'utf8' });
  const names = new Set<string>();
  for (const line of output.split('\n')) {
    const symbol = /^[0-9a-f]+ [A-Z] (\S+)$/.exec(line.trim());
    if (symbol) names.add(symbol[1]);
  }
  return [...names].sort();
}

let driver: string;

beforeAll(() => {
  driver = compileHostCore();
});

afterAll(() => removeHostCore(driver));

describe('the compiled C core', () => {
  it('reports the ABI number its header declares', () => {
    const declaredAbi = Number(/#define SHERLO_CORE_ABI (\d+)/.exec(headerText)?.[1]);
    expect(declaredAbi).toBe(1);
    expect(reportedAbi(driver)).toBe(declaredAbi);
    // and the version the build stamped in, the SDK's own
    expect(reportedVersion(driver)).toBe(coreVersion());
  });

  it('its header takes data in and gives data out, with no callback', () => {
    // No function pointer anywhere: nothing the core is handed can call back into the app.
    expect(headerWithoutComments).not.toMatch(/\(\s*\*/);
    expect(headerWithoutComments).not.toMatch(/\^/);

    const functions = declaredFunctions();
    expect(functions.map((declared) => declared.name)).toEqual([
      'sherlo_core_version',
      'sherlo_core_abi',
      'sherlo_free',
      'sherlo_count_different_pixels',
      'sherlo_still_begin',
      'sherlo_still_step',
      'sherlo_still_end',
    ]);

    // Every parameter is a number, or a pointer to plain data the header defines.
    const dataTypes = [
      'int32_t',
      'int64_t',
      'double',
      'void *',
      'int64_t *',
      'const sherlo_image *',
      'const sherlo_still_params *',
      'sherlo_still_state *',
    ];
    for (const declared of functions) {
      for (const parameterType of declared.parameterTypes) {
        expect(dataTypes, declared.name + ' takes ' + parameterType).toContain(parameterType);
      }
    }
  });

  it('the stripped library shows only the names its header declares', (context) => {
    const headerNames = declaredFunctions()
      .map((declared) => declared.name)
      .sort();
    const outputFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-c-core-libraries-'));
    const notBuilt: string[] = [];

    // iOS: each slice of the xcframework exports the header's names, and nothing else.
    const iosMissing = missingIosTools();
    if (iosMissing) {
      notBuilt.push('iOS (' + iosMissing + ')');
    } else {
      const xcframework = buildIosCore({
        output: path.join(outputFolder, 'SherloCore.xcframework'),
        workDir: path.join(outputFolder, 'work'),
      });
      const slices = fs
        .readdirSync(xcframework)
        .filter((entry) => fs.statSync(path.join(xcframework, entry)).isDirectory());
      expect(slices.sort()).toEqual(['ios-arm64', 'ios-arm64_x86_64-simulator']);
      for (const slice of slices) {
        const library = path.join(xcframework, slice, LIBRARY_FILE_IOS);
        // Mach-O names carry a leading underscore.
        const names = exportedNames(['xcrun', 'nm', '-gU'], library).map((name) =>
          name.replace(/^_/, '')
        );
        console.log(slice + ' ' + fs.statSync(library).size + ' bytes, exports ' + names.join(' '));
        expect(names, slice).toEqual(headerNames);
      }
    }

    // Android: each library exports its JNI entry points, and none of the core's own names.
    const androidMissing = missingAndroidTools();
    const llvmNm = findNdkTool('llvm-nm');
    if (androidMissing || !llvmNm) {
      notBuilt.push('Android (' + (androidMissing || 'the NDK has no llvm-nm') + ')');
    } else {
      const jniLibs = buildAndroidCore({ output: path.join(outputFolder, 'jniLibs') });
      for (const { abi } of ANDROID_ABIS) {
        const library = path.join(jniLibs, abi, LIBRARY_FILE_ANDROID);
        const names = exportedNames([llvmNm, '-D', '--defined-only'], library);
        console.log(abi + ' ' + fs.statSync(library).size + ' bytes, exports ' + names.join(' '));
        expect(names.length, abi).toBeGreaterThan(0);
        for (const name of names) {
          expect(name, abi).toMatch(/^Java_io_sherlo_storybookreactnative_CompiledCore_native\w+$/);
        }
      }
    }

    fs.rmSync(outputFolder, { recursive: true, force: true });
    if (notBuilt.length > 0) {
      console.warn('the stripped C core was not built for ' + notBuilt.join(' and '));
      if (notBuilt.length === 2) context.skip();
    }
  }, 120_000);
});
