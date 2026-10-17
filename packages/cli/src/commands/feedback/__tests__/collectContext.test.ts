/**
 * WHAT collectContext GATHERS, AND WHAT IT LEAVES OUT WHEN IT CANNOT READ IT.
 */
import { describe, expect, it } from 'vitest';
import { collectContext } from '../collectContext';
import {
  installProjectFiles,
  posedProjectFiles,
  type PosedFiles,
} from '../../../seams/projectFiles';

describe('the facts sent beside a report are gathered from the project and the machine', () => {
  it('names the project from the config token without carrying the token', async () => {
    const context = await inFolder({
      'sherlo.config.json': { token: `${'a'.repeat(32)}k3j9x2ab4`, devices: [] },
    });

    expect(context.project).toEqual({ teamId: 'k3j9x2ab', projectIndex: 4 });
    expect(JSON.stringify(context)).not.toContain('a'.repeat(32));
  });

  it('leaves the project and the versions out when the folder has no config and no packages', async () => {
    const context = await inFolder({});

    expect(context.project).toBeUndefined();
    expect(context.reactNativeVersion).toBeUndefined();
    expect(context.cliVersion).toEqual(expect.any(String));
    expect(context.operatingSystem).toEqual(expect.any(String));
  });
});

async function inFolder(files: PosedFiles) {
  const folder = posedProjectFiles(files);
  const uninstall = installProjectFiles(folder);

  try {
    return await collectContext();
  } finally {
    uninstall();
    folder.remove();
  }
}
