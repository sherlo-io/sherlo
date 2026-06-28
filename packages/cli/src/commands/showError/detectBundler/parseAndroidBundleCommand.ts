import * as fs from 'fs';
import * as path from 'path';
import { ProjectType } from '../types';

function parseAndroidBundleCommand(projectRoot: string): ProjectType | null {
  const buildGradlePath = path.join(projectRoot, 'android', 'app', 'build.gradle');
  if (!fs.existsSync(buildGradlePath)) return null;
  let content: string;
  try {
    content = fs.readFileSync(buildGradlePath, 'utf8');
  } catch {
    return null;
  }
  const reactBlock = /\breact\s*\{([^}]*)\}/.exec(content);
  if (!reactBlock) return 'rn'; // legacy bare RN without react block defaults to react-native bundle
  const bundleCommand = /bundleCommand\s*=\s*"([^"]*)"/.exec(reactBlock[1]);
  if (!bundleCommand) return 'rn';
  return bundleCommand[1] === 'export:embed' ? 'expo' : 'rn';
}

export default parseAndroidBundleCommand;
