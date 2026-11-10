import fs from 'fs';
import path from 'path';

/** The Gradle wrapper script inside an android folder. */
export function gradleWrapperIn(androidFolder: string): string {
  return path.join(androidFolder, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
}

/**
 * The Gradle task of each product flavor's release build. An app that declares no flavors is not
 * asked of Gradle at all. `askProgram` runs a program and answers its exit code and output.
 */
export async function listAndroidFlavorTasks(
  projectRoot: string,
  askProgram: (call: {
    command: string;
    args: string[];
    cwd: string;
  }) => Promise<{ exitCode: number; output: string }>
): Promise<string[]> {
  if (!declaresProductFlavors(projectRoot)) return [];
  const androidFolder = path.join(projectRoot, 'android');
  const { exitCode, output } = await askProgram({
    command: gradleWrapperIn(androidFolder),
    args: [':app:tasks', '--all'],
    cwd: androidFolder,
  });
  if (exitCode !== 0) {
    throw new Error(`\`gradlew :app:tasks --all\` could not list the tasks:\n${output.trimEnd()}`);
  }
  return flavorReleaseTasksIn(output);
}

/** The app module's build files, either of which may declare product flavors. */
const APP_BUILD_FILES = ['build.gradle', 'build.gradle.kts'];

/** Whether the app module's build file mentions `productFlavors`; an app without pays no Gradle run. */
export function declaresProductFlavors(projectRoot: string): boolean {
  return APP_BUILD_FILES.some((file) => {
    const buildFile = path.join(projectRoot, 'android', 'app', file);
    return (
      fs.existsSync(buildFile) && fs.readFileSync(buildFile, 'utf8').includes('productFlavors')
    );
  });
}

/**
 * `:app:assemble<Flavor>Release` for each flavor release task in the output of
 * `./gradlew :app:tasks --all`, in the order Gradle listed them.
 */
export function flavorReleaseTasksIn(tasksOutput: string): string[] {
  const tasks = new Set<string>();
  for (const line of tasksOutput.split('\n')) {
    const flavor = /^assemble([A-Z]\w*)Release\b/.exec(line)?.[1];
    if (flavor) tasks.add(`:app:assemble${flavor}Release`);
  }
  return [...tasks];
}

/**
 * The folder the `sdk.dir` line of the project's `android/local.properties` names, or undefined.
 * The file is in Java's properties format, which escapes `:` and `\` with a backslash, and a
 * relative folder is read from the `android` folder, as Gradle reads it.
 */
export function sdkDirOfLocalProperties(projectRoot: string): string | undefined {
  const androidFolder = path.join(projectRoot, 'android');
  const propertiesPath = path.join(androidFolder, 'local.properties');
  const properties = fs.existsSync(propertiesPath) ? fs.readFileSync(propertiesPath, 'utf8') : '';
  const sdkDirLine = /^\s*sdk\.dir\s*[=:]\s*(.*?)\s*$/m.exec(properties);
  if (!sdkDirLine) return undefined;
  const sdkDir = sdkDirLine[1].replace(/\\(.)/g, '$1');
  return path.resolve(androidFolder, sdkDir);
}

/**
 * The major version `java -version` reports: `"17.0.2"` is 17, `"21"` is 21, and the old
 * `"1.8.0_292"` is 8. Null when it reports none.
 */
export function javaMajorVersionIn(output: string): number | null {
  const version = /version "(\d+)(?:\.(\d+))?/.exec(output);
  if (!version) return null;
  const [, first, second] = version;
  return Number(first === '1' && second ? second : first);
}
