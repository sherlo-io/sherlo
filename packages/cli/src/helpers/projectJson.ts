/**
 * THE PROJECT'S OWN JSON FILES - `package.json`, `app.json`, `eas.json` - read one way, for every
 * question the tool asks of them.
 */
import fs from 'fs';
import path from 'path';

/**
 * A JSON file of the project, or undefined when it is missing or cannot be read: a file the tool
 * cannot read answers none of its questions. Each caller reads the fields it asks about, so the
 * file's shape is left untyped.
 */
export function readProjectJson(projectRoot: string, fileName: string): any {
  try {
    return JSON.parse(fs.readFileSync(path.join(projectRoot, fileName), 'utf8'));
  } catch {
    return undefined;
  }
}

/** Whether the project's `package.json` lists `expo`, as a dependency or a dev dependency. */
export function dependsOnExpo(projectRoot: string): boolean {
  const packageJson = readProjectJson(projectRoot, 'package.json');
  return 'expo' in { ...packageJson?.dependencies, ...packageJson?.devDependencies };
}
