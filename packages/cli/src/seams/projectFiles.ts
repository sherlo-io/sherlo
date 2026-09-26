/**
 * THE PROJECT FOLDER SEAM - where the files a command reads come from.
 *
 * A command is given paths, and every one of them is resolved from ONE place: the folder the
 * command runs against. `--projectRoot` names it explicitly; without the flag it is wherever the
 * user is standing. That single answer is this seam, and it is the whole of what a pose has to
 * replace in order to run a command against a project that is not on this machine.
 *
 *     live   - the folder the user is standing in, read off the process.
 *     posed  - a folder laid out from the pose's `files`, under a temporary root of its own.
 *
 * WHY THE POSED FOLDER IS A REAL FOLDER ON DISK, rather than a map the reads answer from.
 * The tool prints paths - a config file it could not find, a build file it was handed - and a
 * posed run has to print them the way a real one does, through the same `path.resolve` and the
 * same `fs` error codes. A map behind an interface would answer the reads and then have to
 * re-invent every path the tool speaks about. So the pose's files are written out, the tool reads
 * the disk exactly as it always does, and the one machine-only fact that leaves behind - the
 * temporary root's name - is folded to `<PROJECT_ROOT>` on the way out (see ../commands/pose/pose).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

/** Where the project a command runs against lives. */
export type ProjectFiles = {
  /** The folder every relative path the command is given resolves from. */
  root(): string;
};

/** The shipped answer: the folder the user is standing in. */
export const liveProjectFiles: ProjectFiles = {
  root: () => process.cwd(),
};

let installed: ProjectFiles = liveProjectFiles;

/** The folder in force. One command runs per process, so a per-process answer is the honest scope. */
export function projectFiles(): ProjectFiles {
  return installed;
}

/** Install a folder for the duration of one posed run; the returned function puts the live one back. */
export function installProjectFiles(files: ProjectFiles): () => void {
  const previous = installed;
  installed = files;
  return () => {
    installed = previous;
  };
}

/**
 * The project folder a pose declares: relative path -> content. A string is written as is; an
 * object is written as JSON. `{"sherlo.config.json": {"devices": []}}` poses the empty-devices
 * refusal; `{}` poses a folder with no config file. Nothing touches the disk outside the
 * temporary root below: the tool's file reads answer from what this map laid down, and a path
 * outside it does not exist.
 */
export type PosedFiles = Record<string, string | Record<string, unknown>>;

/** A folder laid out from a pose's `files`, plus the two things a posed run needs to know about it. */
export type PosedProjectFiles = ProjectFiles & {
  /** Delete the temporary folder. */
  remove(): void;
};

/**
 * Write a pose's `files` into a temporary folder of this run's own and answer from there.
 *
 * A string is written as is; an object is written as JSON, so `{"sherlo.config.json": {...}}` reads
 * as the config file it depicts. Parent folders are created, so a pose states `builds/app.apk`
 * without also stating `builds/`. The root is REAL-PATHED: on macOS the system temporary folder is
 * reached through a symlink, and the tool prints the resolved path - so folding the unresolved one
 * out of the output would miss.
 */
export function posedProjectFiles(files: PosedFiles): PosedProjectFiles {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-pose-')));

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`
    );
  }

  return {
    root: () => root,
    remove: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}
