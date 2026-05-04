import chalk from 'chalk';
import { execSync } from 'child_process';
import throwError from '../../helpers/throwError';
import logWarning from '../../helpers/logWarning';
import { printTitle } from '../init/helpers';
import { SLUG_REGEX } from './constants';
import { detectEntryFile, default as detectBundler, parseAndroidBundleCommand, parseIosBundleCommand } from './detectBundler';
import detectPlatform from './detectPlatform';
import { default as buildSourceMaps, findSourceMap } from './buildSourceMaps';
import { default as symbolicateAllFrames, runMetroSymbolicate } from './symbolicateFrames';
import fetchError, { resolveApiBaseUrl, resolveShowErrorUrl } from './fetchError';
import renderOutput from './renderOutput';

async function showError(slug: string): Promise<void> {
  if (!SLUG_REGEX.test(slug)) {
    throwError({
      message: `Invalid slug format: "${slug}"`,
      below: chalk.dim(
        `  Expected format: <teamId>-<projectIndex>-(ios|android)-<timestamp>\n` +
        `  Example: PsS5H1B1-30-android-1777491220857\n` +
        `  The slug is printed on the build error page in the Sherlo dashboard.`
      ),
    });
  }

  const projectRoot = process.cwd();

  // 1. Fetch and parse JSON payload (via GET /v1/show-error/{slug} → 302 → S3)
  console.log(chalk.dim('Fetching error from Sherlo...'));
  let data: Awaited<ReturnType<typeof fetchError>>;
  try {
    data = await fetchError(slug);
  } catch (err: any) {
    if (err.is404) {
      throwError({ message: err.message });
    }
    throwError({ message: `Failed to fetch error: ${err.message}`, errorToReport: err });
  }

  // 2. Detect platform from frame file paths
  const allFilePaths = [...data.stack, ...data.componentStack]
    .map(f => f.file || '')
    .join('\n');
  const platform = detectPlatform(allFilePaths);

  // 3. Detect bundler from native build scripts
  let projectType: Awaited<ReturnType<typeof detectBundler>>;
  try {
    projectType = detectBundler(projectRoot);
  } catch (err: any) {
    throwError({ message: err.message, errorToReport: err });
  }

  const engine = data.engine ?? 'hermes';
  console.log(chalk.dim(`Detected: ${platform} · ${projectType} · ${engine}`));

  // 4. Pre-flight git check
  try {
    const gitStatus = execSync('git status --porcelain', {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString().trim();
    if (gitStatus) {
      const n = gitStatus.split('\n').length;
      logWarning({
        message: `${n} uncommitted file${n === 1 ? '' : 's'} in working tree. ` +
          `Source maps may misalign with the deployed bundle. Consider git stash first.`,
      });
    }
  } catch (_) {
    // not a git repo or git unavailable — skip
  }

  // 5. Build source maps
  let sourceMapPath: string;
  try {
    sourceMapPath = buildSourceMaps(projectRoot, projectType, platform);
  } catch (err: any) {
    throwError({ message: err.message, errorToReport: err });
  }

  // 6. Print error header
  console.log(`\n${chalk.red.bold(data.name)}: ${data.message}`);

  // Only symbolicate stack + cause (componentStack is not printed, skip for speed and clean counts)
  const stackAndCause = [...data.stack, ...(data.cause?.stack ?? [])];
  const locatedCount = stackAndCause.filter(f => f.file !== null).length;
  if (locatedCount === 0) {
    logWarning({ message: 'No stack frames with location found in error payload.' });
    return;
  }

  // 7. Symbolicate stack + cause in a single batch
  const stackLen = data.stack.length;
  let symResult: ReturnType<typeof symbolicateAllFrames>;
  try {
    symResult = symbolicateAllFrames(stackAndCause, sourceMapPath, projectRoot);
  } catch (err: any) {
    throwError({ message: `Symbolication failed: ${err.message}`, errorToReport: err });
  }

  const { frames: symStackAndCause, totalFrames, resolvedFrames } = symResult;

  const outputData = {
    ...data,
    stack: symStackAndCause.slice(0, stackLen),
    cause: data.cause
      ? { ...data.cause, stack: symStackAndCause.slice(stackLen) }
      : null,
  };

  // 8. Print symbolicated sections + footer
  await printTitle('🔍 Symbolicated stack');
  console.log(renderOutput(outputData));
  console.log(chalk.dim(`\nResolved ${resolvedFrames} of ${totalFrames} frames`));

  if (totalFrames > 0 && resolvedFrames / totalFrames < 0.5) {
    logWarning({ message: 'Most frames did not resolve. Source maps may be from a different commit.' });
  }

  console.log(chalk.green('\n✓ Done'));
}

export default showError;

// Re-export everything tests import from this file for backwards-compatibility
export {
  detectPlatform,
  detectBundler,
  parseIosBundleCommand,
  parseAndroidBundleCommand,
  detectEntryFile,
  findSourceMap,
  buildSourceMaps,
  runMetroSymbolicate,
  symbolicateAllFrames,
  renderOutput,
  SLUG_REGEX,
  resolveApiBaseUrl,
  resolveShowErrorUrl,
};
export type { ParsedFrame, JsErrorJson } from './types';
