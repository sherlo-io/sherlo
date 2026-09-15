import { projectFiles } from '../seams/projectFiles';

/**
 * The folder the command runs against - what `sherlo init` and the EAS roads resolve their
 * relative paths from.
 *
 * It answers from the project-folder seam (../seams/projectFiles) rather than reading
 * `process.cwd()` here, so those roads can be posed too: on a live run the seam IS the process's
 * working directory, so nothing about what they read changes.
 */
function getCwd(): string {
  return projectFiles().root();
}

export default getCwd;
