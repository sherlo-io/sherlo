import fs from 'fs';
import path from 'path';
import { SHERLO_TEMP_DIRECTORY, SHERLO_TEMP_DATA_FILE } from '../../constants';

function createSherloTempDirectory({
  projectRoot,
  buildIndex,
  token,
}: {
  projectRoot: string;
  buildIndex: number;
  token: string;
}): void {
  const sherloDir = path.resolve(projectRoot, SHERLO_TEMP_DIRECTORY);

  if (!fs.existsSync(sherloDir)) {
    fs.mkdirSync(sherloDir);
  }

  fs.writeFileSync(
    path.resolve(sherloDir, SHERLO_TEMP_DATA_FILE),
    JSON.stringify({ buildIndex, token }, null, 2)
  );

  // TODO: poprawic komendy + "remote Expo mode"
  fs.writeFileSync(
    path.resolve(sherloDir, 'README.md'),
    `### Why do I have a folder named "${SHERLO_TEMP_DIRECTORY}" in my project?

This folder appears when you run Sherlo in remote Expo mode using:
- \`sherlo --remoteExpo\`, or
- \`sherlo --remoteExpoBuildScript <scriptName>\`

If you use \`--remoteExpoBuildScript\`, the folder should be auto-deleted when the
build script completes. With \`--remoteExpo\`, you need to handle it yourself.

### What does it contain?

It contains data necessary for Sherlo to authenticate and identify builds
created on Expo servers.

### Should I commit it?

No, you don't need to. However, it must be uploaded to Expo for remote builds.

To exclude it from version control:
1. Add it to \`.gitignore\`.
2. Create an \`.easignore\` file at the root of your git project, and list the
   files and directories you don't want to upload to Expo. Make sure \`${SHERLO_TEMP_DIRECTORY}\`
   is not listed, as it needs to be uploaded during the build process.

Alternatively, you can manually delete the folder after it has been uploaded
during the EAS build process.`
  );
}

export default createSherloTempDirectory;
