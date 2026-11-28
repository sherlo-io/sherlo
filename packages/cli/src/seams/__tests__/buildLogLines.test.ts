import { describe, expect, it } from 'vitest';
import { buildLogLinesShown } from '../buildLogLines';

const LIMIT = 30;
const notes = (count: number) =>
  Array.from({ length: count }, (_, i) => `Note: warning number ${i}`);

describe('the lines a failed build shows', () => {
  it('a failed Gradle build shows the What went wrong block and the error lines, not only its last lines', () => {
    const log = [
      '> Task :react-native-webview:compileReleaseJavaWithJavac FAILED',
      'RNCWebView.java:117: error: cannot find symbol',
      '        R.raw.extras',
      '1 error',
      '',
      'FAILURE: Build failed with an exception.',
      '',
      '* What went wrong:',
      "Execution failed for task ':react-native-webview:compileReleaseJavaWithJavac'.",
      '> Compilation failed; see the compiler error output for details.',
      '',
      '* Try:',
      '> Run with --stacktrace option to get the stack trace.',
      ...notes(40),
    ].join('\n');

    const shown = buildLogLinesShown(log, LIMIT);

    expect(shown).toContain('RNCWebView.java:117: error: cannot find symbol');
    expect(shown).toContain('* What went wrong:');
    expect(shown).toContain('> Compilation failed; see the compiler error output for details.');
    expect(shown).not.toContain('* Try:');
    expect(shown.length).toBeLessThanOrEqual(LIMIT);
    expect(shown[shown.length - 1]).toBe('Note: warning number 39');
  });

  it('a failed xcodebuild shows its error lines', () => {
    const log = [
      '/ios/Pods/Foo/Foo.m:12:5: error: use of undeclared identifier bar',
      '/ios/Pods/Foo/Foo.m:30:1: error: expected } at end of input',
      ...notes(60).map((note) => `/ios/App/File.m:1:1: warning: ${note}`),
      '** BUILD FAILED **',
    ].join('\n');

    const shown = buildLogLinesShown(log, LIMIT);

    expect(shown).toContain('/ios/Pods/Foo/Foo.m:12:5: error: use of undeclared identifier bar');
    expect(shown).toContain('/ios/Pods/Foo/Foo.m:30:1: error: expected } at end of input');
    expect(shown.length).toBeLessThanOrEqual(LIMIT);
  });

  it('a failed Xcode build shows its compiler error, not header lines whose selectors say error:', () => {
    const header = (i: number) =>
      `+ (NSDictionary *) stat${i}:(NSString *) path error:(NSError **) error;`;
    const compilerLine = "/ios/App/File.m:12:5: error: use of undeclared identifier 'x'";
    const log = [
      ...Array.from({ length: 40 }, (_, i) => header(i)),
      compilerLine,
      ...notes(40),
      '** BUILD FAILED **',
    ].join('\n');

    const shown = buildLogLinesShown(log, LIMIT);

    expect(shown.slice(0, 2)).toEqual([compilerLine, '** BUILD FAILED **']);
    expect(shown.filter((line) => line.includes('error:(NSError'))).toEqual([]);
  });

  it('a failed Xcode build shows a missing-header fatal error and the linker error among selector headers', () => {
    const header = (i: number) =>
      `+ (NSDictionary *) stat${i}:(NSString *) path error:(NSError **) error;`;
    const fatalLine = "/ios/App/File.m:3:10: fatal error: 'Missing.h' file not found";
    const linkerLine =
      'clang: error: linker command failed with exit code 1 (use -v to see invocation)';
    const log = [
      ...Array.from({ length: 20 }, (_, i) => header(i)),
      fatalLine,
      ...notes(40),
      linkerLine,
      ...notes(40),
    ].join('\n');

    const shown = buildLogLinesShown(log, LIMIT);

    expect(shown.slice(0, 2)).toEqual([fatalLine, linkerLine]);
    expect(shown.filter((line) => line.includes('error:(NSError'))).toEqual([]);
  });

  it("a failed Gradle build shows R8's ERROR lines", () => {
    const r8Line = 'ERROR: R8: Missing class com.example.Foo';
    const log = [...notes(5), r8Line, ...notes(60)].join('\n');

    expect(buildLogLinesShown(log, LIMIT)).toContain(r8Line);
  });

  it('the same error line repeated many times is shown once', () => {
    const errorLine = '/ios/App/File.m:1:1: error: unknown type name Foo';
    const log = [...Array(20).fill(errorLine), ...notes(50)].join('\n');

    const shown = buildLogLinesShown(log, LIMIT);

    expect(shown.filter((line) => line === errorLine)).toHaveLength(1);
  });

  it('a failed build with no error line still shows its last lines', () => {
    const lines = notes(50);

    expect(buildLogLinesShown(lines.join('\n'), LIMIT)).toEqual(lines.slice(-LIMIT));
  });
});
