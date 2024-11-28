import fs from 'fs';
import path from 'path';
import { SHERLO_TEMP_DIRECTORY } from '../../../constants';

function removeSherloTempDirectory(projectRoot: string): void {
  const sherloDir = path.resolve(projectRoot, SHERLO_TEMP_DIRECTORY);

  if (fs.existsSync(sherloDir)) {
    fs.rmSync(sherloDir, { recursive: true, force: true });
  }
}

export default removeSherloTempDirectory;
