import fs from 'fs';
import path from 'path';
import { getCwd, throwError } from '../../../helpers';
import { renderMetroConfigUnreadable } from '../../../render/initFixes';
import getMetroConfigPath from '../metroConfig/getMetroConfigPath';
import { rewriteMetroConfig } from '../metroConfig/writeMetroConfigUpdate';

/**
 * Refuses, before the login, the one Metro config the Metro step could not wire: a shape setup
 * cannot read. A missing config or one without withStorybook is no refusal - the Metro step writes
 * or wraps it.
 */
async function refuseUnreadableMetroConfig(): Promise<void> {
  const configPath = getMetroConfigPath();
  if (!configPath) return;

  const content = await fs.promises.readFile(configPath, 'utf-8');

  if (rewriteMetroConfig(content) === null) {
    throwError(renderMetroConfigUnreadable({ path: path.relative(getCwd(), configPath) }));
  }
}

export default refuseUnreadableMetroConfig;
