import path from 'path';
import fs from 'fs';

function createExpoSherloTempFile({
  projectRoot,
  buildIndex,
  url,
}: {
  projectRoot: string;
  buildIndex: number;
  url: string;
}): void {
  const packageJsonPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`No package.json found in projectRoot directory (${projectRoot}).`);
  }

  try {
    const packageJsonData = fs.readFileSync(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageJsonData);

    // Check if the scripts section is defined and if 'eas-build-on-success' script exists
    if (packageJson.scripts && packageJson.scripts['eas-build-on-success']) {
      const expoDir = path.join(projectRoot, '.expo');

      // Check if the directory exists
      if (!fs.existsSync(expoDir)) {
        // If the directory does not exist, create it
        fs.mkdirSync(expoDir, { recursive: true });
      }

      // Now that we've ensured the directory exists, write the file
      fs.writeFileSync(path.join(expoDir, 'sherlo.json'), JSON.stringify({ buildIndex, url }));
    }
  } catch (err) {
    // If there's an error, continue
  }
}

export default createExpoSherloTempFile;
