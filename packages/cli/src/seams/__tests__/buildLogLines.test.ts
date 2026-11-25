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

  it('a failed build with no error line still shows its last lines', () => {
    const lines = notes(50);

    expect(buildLogLinesShown(lines.join('\n'), LIMIT)).toEqual(lines.slice(-LIMIT));
  });
});
