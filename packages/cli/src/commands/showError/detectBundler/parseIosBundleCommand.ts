import * as fs from 'fs';
import * as path from 'path';
import { ProjectType } from '../types';

function parseIosBundleCommand(projectRoot: string): ProjectType | null {
  const iosDir = path.join(projectRoot, 'ios');
  if (!fs.existsSync(iosDir)) return null;
  let entries: string[];
  try { entries = fs.readdirSync(iosDir); } catch { return null; }
  const xcodeproj = entries.find(e => e.endsWith('.xcodeproj'));
  if (!xcodeproj) return null;
  const pbxprojPath = path.join(iosDir, xcodeproj, 'project.pbxproj');
  if (!fs.existsSync(pbxprojPath)) return null;
  let content: string;
  try { content = fs.readFileSync(pbxprojPath, 'utf8'); } catch { return null; }
  // Expo markers in the bundle shell script
  if (
    /BUNDLE_COMMAND=\\?"export:embed\\?"/.test(content) ||
    /expo\/scripts\/resolveAppEntry/.test(content) ||
    /CLI_PATH=[^\n]*@expo\/cli/.test(content)
  ) return 'expo';
  // RN marker: the standard react-native-xcode.sh is the bundle phase script for bare RN
  if (/react-native-xcode\.sh|Bundle React Native code/i.test(content)) return 'rn';
  return null;
}

export default parseIosBundleCommand;
