/**
 * The seam (../sealedCore/seam.ts): the one open contract between the SDK and its sealed cores,
 * which sherlo-runner keeps a tracked copy of and types the cores against.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { COMPILED_CORE_NATIVE_METHODS, COMPILED_CORE_R8_KEEP_RULE } from '../sealedCore/seam';

// packages/react-native-storybook root: this file is at src/__tests__/.
const SDK_ROOT = path.resolve(__dirname, '..', '..');
const SEAM_FILE = path.join(SDK_ROOT, 'src', 'sealedCore', 'seam.ts');
const COMPILED_CORE_JAVA = path.join(
  SDK_ROOT,
  'android/src/main/java/io/sherlo/storybookreactnative/CompiledCore.java'
);
const CONSUMER_RULES = path.join(SDK_ROOT, 'android', 'consumer-rules.pro');

describe('the seam', () => {
  it('the seam imports nothing from the rest of the SDK', () => {
    const seamSource = fs.readFileSync(SEAM_FILE, 'utf8');

    // Every import, `export ... from`, `import()` and `require()` the file makes, as the compiler
    // reads them.
    const imported = ts
      .preProcessFile(seamSource, true, true)
      .importedFiles.map((importedFile) => importedFile.fileName);

    expect(imported).toEqual([]);
  });

  it('the seam lists every native method of CompiledCore and the R8 rule that keeps them', () => {
    const compiledCoreSource = fs.readFileSync(COMPILED_CORE_JAVA, 'utf8');
    const nativeMethodDeclaration = /\bnative\s+[\w[\]<>]+\s+(\w+)\s*\(/g;
    const nativeMethodsOfCompiledCore = [
      ...compiledCoreSource.matchAll(nativeMethodDeclaration),
    ].map((match) => match[1]);

    expect(nativeMethodsOfCompiledCore.length).toBeGreaterThan(0);
    expect([...COMPILED_CORE_NATIVE_METHODS].sort()).toEqual(nativeMethodsOfCompiledCore.sort());

    expect(fs.readFileSync(CONSUMER_RULES, 'utf8')).toContain(COMPILED_CORE_R8_KEEP_RULE);
  });
});
