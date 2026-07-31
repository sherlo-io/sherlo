import * as fs from 'fs';
import * as path from 'path';
import logWarning from '../../../helpers/logWarning';
import { Platform, ProjectType } from '../types';

function findSourceMap(projectRoot: string, projectType: ProjectType, platform: Platform): string {
  if (projectType === 'expo') {
    // Primary: plain-JS map produced by expo export:embed
    const plainMap = path.join(projectRoot, '.sherlo-cache', `bundle.${platform}.js.map`);
    if (fs.existsSync(plainMap)) return plainMap;

    // Secondary: stale dist from old 'expo export' run - refuse if it's a .hbc.map
    const distDir = path.join(
      projectRoot,
      '.sherlo-cache',
      'dist',
      '_expo',
      'static',
      'js',
      platform
    );
    if (fs.existsSync(distDir)) {
      const maps = fs.readdirSync(distDir).filter((f) => f.endsWith('.map'));
      if (maps.length > 0) {
        const mapFile = maps[0];
        if (mapFile.endsWith('.hbc.map')) {
          throw new Error(
            `Found Hermes bytecode source map (${mapFile}) which does not match the plain JS bundle in your error. ` +
              "Run sherlo show-error again to rebuild via 'expo export:embed'."
          );
        }
        logWarning({
          message:
            "Using stale map from dist/ - may produce 0 resolved frames if it was built with 'expo export' (Hermes bytecode).",
        });
        return path.join(distDir, mapFile);
      }
    }

    throw new Error(
      `No source map found for ${platform}. ` +
        `Run 'npx expo export:embed --platform=${platform} --entry-file=index.js --bundle-output=.sherlo-cache/bundle.${platform}.js --sourcemap-output=.sherlo-cache/bundle.${platform}.js.map --dev=false' manually.`
    );
  } else {
    const mapPath = path.join(projectRoot, '.sherlo-cache', `bundle.${platform}.jsbundle.map`);
    if (fs.existsSync(mapPath)) return mapPath;
    throw new Error(`No source map found at ${mapPath}. Build may have failed.`);
  }
}

export default findSourceMap;
