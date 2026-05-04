import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

function runMetroSymbolicate(frameLines: string[], sourceMapPath: string, projectRoot: string): string[] {
  if (frameLines.length === 0) return [];
  const input = frameLines.join('\n');
  try {
    // Invoke metro-symbolicate via 'node' explicitly, resolving the .bin symlink to
    // the real JS file. This bypasses execute-permission issues that occur when yarn
    // installs metro-symbolicate without the exec bit on its bin entry (e.g. 0.83.7).
    const binLink = path.join(projectRoot, 'node_modules', '.bin', 'metro-symbolicate');
    let cmd: string;
    if (fs.existsSync(binLink)) {
      const realScript = fs.realpathSync(binLink);
      cmd = `node ${JSON.stringify(realScript)} ${JSON.stringify(sourceMapPath)}`;
    } else {
      cmd = `npx metro-symbolicate ${JSON.stringify(sourceMapPath)}`;
    }
    const result = execSync(cmd, {
      cwd: projectRoot,
      input,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const lines = result.toString().split('\n');
    // metro-symbolicate may output fewer or more lines; align by count
    return lines.slice(0, frameLines.length);
  } catch (err: any) {
    throw new Error(`metro-symbolicate failed: ${err.message || String(err)}`);
  }
}

export default runMetroSymbolicate;
