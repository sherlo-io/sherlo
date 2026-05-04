import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import ora from 'ora';
import { Platform, ProjectType } from '../types';
import { detectEntryFile } from '../detectBundler';
import findSourceMap from './findSourceMap';

function buildSourceMaps(projectRoot: string, projectType: ProjectType, platform: Platform): string {
  const cacheDir = path.join(projectRoot, '.sherlo-cache');
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  const entryFile = detectEntryFile(projectRoot);
  const spinner = ora('Building source maps').start();
  const start = Date.now();

  let effectiveProjectType = projectType;

  try {
    if (projectType === 'expo') {
      // Use export:embed to produce the same plain-JS bundle as the deployed app.
      // 'expo export' (without :embed) produces Hermes bytecode (.hbc) whose source
      // map line:col coords don't match the plain JS bundle in the error stack.
      const bundleOut = path.join(cacheDir, `bundle.${platform}.js`);
      const mapOut = `${bundleOut}.map`;
      try {
        execSync(
          `npx expo export:embed --platform=${platform} --entry-file=${entryFile} --bundle-output=${bundleOut} --sourcemap-output=${mapOut} --dev=false --reset-cache`,
          { cwd: projectRoot, stdio: ['pipe', 'pipe', 'pipe'] }
        );
      } catch (expoErr: any) {
        spinner.warn(`expo build failed (${expoErr.message || String(expoErr)}), retrying with rn bundler...`);
        const rnBundleOut = path.join(cacheDir, `bundle.${platform}.jsbundle`);
        const rnMapOut = `${rnBundleOut}.map`;
        execSync(
          `npx react-native bundle --platform ${platform} --dev false --entry-file ${entryFile} --bundle-output ${rnBundleOut} --sourcemap-output ${rnMapOut} --reset-cache`,
          { cwd: projectRoot, stdio: ['pipe', 'pipe', 'pipe'] }
        );
        effectiveProjectType = 'rn';
      }
    } else {
      const bundleOut = path.join(cacheDir, `bundle.${platform}.jsbundle`);
      const mapOut = `${bundleOut}.map`;
      execSync(
        `npx react-native bundle --platform ${platform} --dev false --entry-file ${entryFile} --bundle-output ${bundleOut} --sourcemap-output ${mapOut} --reset-cache`,
        { cwd: projectRoot, stdio: ['pipe', 'pipe', 'pipe'] }
      );
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    spinner.succeed(`Built source maps (${elapsed}s)`);
  } catch (err: any) {
    spinner.fail('Source map build failed');
    const errOutput = (err.stderr?.toString?.() || '') + (err.stdout?.toString?.() || '');
    throw new Error(`Source map build failed: ${err.message || String(err)}${errOutput ? '\n' + errOutput : ''}`);
  }

  return findSourceMap(projectRoot, effectiveProjectType, platform);
}

export default buildSourceMaps;
