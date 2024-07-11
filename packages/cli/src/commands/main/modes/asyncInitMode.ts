import { Build } from '@sherlo/api-types';
import SDKApiClient from '@sherlo/sdk-client';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { DOCS_LINK, DEFAULT_PROJECT_ROOT } from '../constants';
import { getErrorMessage, getTokenParts } from '../utils';
import { Config } from '../types';
import { getAppBuildUrl, getBuildRunConfig, handleClientError } from './utils';

async function asyncInitMode({
  projectRoot,
  config,
  token,
  gitInfo,
  remoteExpo,
  remoteExpoBuildScript,
}: {
  projectRoot: string;
  config: Config<'withoutBuildPaths'>;
  token: string;
  gitInfo: Build['gitInfo'];
  remoteExpo?: boolean;
  remoteExpoBuildScript?: string;
}): Promise<{ buildIndex: number; url: string }> {
  const isExpoRemoteMode = remoteExpo || remoteExpoBuildScript;

  if (isExpoRemoteMode) {
    validateEasBuildOnSuccessScript(projectRoot);

    if (remoteExpoBuildScript) {
      validateRemoteExpoBuildScript(projectRoot, remoteExpoBuildScript);
    }
  }

  const { apiToken, projectIndex, teamId } = getTokenParts(token);
  const client = SDKApiClient(apiToken);

  const { build } = await client
    .openBuild({
      teamId,
      projectIndex,
      gitInfo,
      asyncUpload: true,
      buildRunConfig: getBuildRunConfig({ config }),
    })
    .catch(handleClientError);

  const buildIndex = build.index;

  if (isExpoRemoteMode) {
    createSherloTempFolder({ buildIndex, projectRoot, token });

    console.log('Sherlo is waiting for your app to be built on Expo servers.\n');

    if (remoteExpoBuildScript) {
      runScript({
        projectRoot,
        scriptName: remoteExpoBuildScript,
        onExit: () => removeSherloTempFolder(projectRoot),
      });
    }
  } else {
    console.log(
      `Sherlo is waiting for your builds to be uploaded asynchronously.\nCurrent build index: ${buildIndex}.\n`
    );
  }

  const url = getAppBuildUrl({ buildIndex, projectIndex, teamId });

  return { buildIndex, url };
}

export default asyncInitMode;

/* ========================================================================== */

function validateEasBuildOnSuccessScript(projectRoot: string): void {
  const scriptName = 'eas-build-on-complete';

  validatePackageJsonScript({
    projectRoot,
    scriptName: scriptName,
    errorMessage: `script "${scriptName}" is not defined in package.json`,
    learnMoreLink: DOCS_LINK.remoteExpoBuilds,
  });
}

function validateRemoteExpoBuildScript(projectRoot: string, remoteExpoBuildScript: string): void {
  const scriptName = remoteExpoBuildScript;

  validatePackageJsonScript({
    projectRoot,
    scriptName: scriptName,
    errorMessage: `script "${scriptName}" passed by \`--remoteExpoBuildScript\` is not defined in package.json`,
    learnMoreLink: DOCS_LINK.sherloScriptRemoteExpo,
  });
}

function validatePackageJsonScript({
  projectRoot,
  scriptName,
  errorMessage,
  learnMoreLink,
}: {
  projectRoot: string;
  scriptName: string;
  errorMessage: string;
  learnMoreLink: string;
}) {
  const packageJsonPath = path.resolve(projectRoot, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(
      getErrorMessage({
        message: `package.json file not found at location "${projectRoot}" - make sure the directory is correct or pass the \`--projectRoot\` flag to the script`,
        learnMoreLink: DOCS_LINK.sherloScriptFlags,
      })
    );
  }

  const packageJsonData = fs.readFileSync(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(packageJsonData);

  if (!packageJson.scripts || !packageJson.scripts[scriptName]) {
    throw new Error(
      getErrorMessage({
        message: errorMessage,
        learnMoreLink,
      })
    );
  }
}

function createSherloTempFolder({
  projectRoot,
  buildIndex,
  token,
}: {
  projectRoot: string;
  buildIndex: number;
  token: string;
}): void {
  const sherloDir = path.resolve(projectRoot, '.sherlo');

  if (!fs.existsSync(sherloDir)) {
    fs.mkdirSync(sherloDir);
  }

  fs.writeFileSync(
    path.resolve(sherloDir, 'data.json'),
    JSON.stringify({ buildIndex, token }, null, 2)
  );

  fs.writeFileSync(
    path.resolve(sherloDir, 'README.md'),
    `### Why do I have a folder named ".sherlo" in my project?

This folder appears when you run Sherlo in remote Expo mode using:
- \`sherlo --remoteExpo\`, or
- \`sherlo --remoteExpoBuildScript <scriptName>\`

If you use \`--remoteExpoBuildScript\`, the folder is auto-deleted when the build
script completes. With \`--remoteExpo\`, you need to handle it yourself.

### What does it contain?

It contains data necessary for Sherlo to authenticate and identify builds
created on Expo servers.

### Should I commit it?

No, you don't need to. However, it must be uploaded to Expo for remote builds.

To exclude it from version control:
1. Add it to \`.gitignore\`.
2. Create an \`.easignore\` file at the root of your git project, and list the
   files and directories you don't want to upload to Expo. Make sure \`.sherlo\`
   is not listed, as it needs to be uploaded during the build process.

Alternatively, you can manually delete the folder after it has been uploaded
during the EAS build process.`
  );
}

function removeSherloTempFolder(projectRoot: string): void {
  const sherloDir = path.resolve(projectRoot, '.sherlo');

  if (fs.existsSync(sherloDir)) {
    fs.rmSync(sherloDir, { recursive: true, force: true });
  }
}

function runScript({
  projectRoot,
  scriptName,
  onExit,
}: {
  projectRoot: string;
  scriptName: string;
  onExit: () => void;
}) {
  let command = '';
  let args: string[] = [];

  const packageManager = detectPackageManager();

  if (packageManager === 'npm') {
    command = 'npm';

    if (projectRoot !== DEFAULT_PROJECT_ROOT) {
      args = ['--prefix', projectRoot];
    }

    args = [...args, 'run', scriptName];
  } else if (packageManager === 'yarn') {
    command = 'yarn';

    if (projectRoot !== DEFAULT_PROJECT_ROOT) {
      args = ['--cwd', projectRoot];
    }

    args = [...args, scriptName];
  } else if (packageManager === 'pnpm') {
    command = 'pnpm';

    if (projectRoot !== DEFAULT_PROJECT_ROOT) {
      args = ['--dir', projectRoot];
    }

    args = ['run', scriptName];
  }

  const process = spawn(command, args, { stdio: 'inherit' });

  process.on('exit', onExit);
  process.on('error', onExit);
}

function detectPackageManager(): 'npm' | 'yarn' | 'pnpm' {
  if (process.env.npm_config_user_agent) {
    const userAgent = process.env.npm_config_user_agent.toLowerCase();

    if (userAgent.includes('yarn')) {
      return 'yarn';
    }
    if (userAgent.includes('pnpm')) {
      return 'pnpm';
    }
    if (userAgent.includes('npm')) {
      return 'npm';
    }
  }

  // Fallback: Check for lock files in current, parent, and grandparent directories
  function detectByLockFile() {
    const depth = 3; // Check current, parent, and grandparent directories to cover monorepo cases
    const lockFiles = ['yarn.lock', 'pnpm-lock.yaml', 'package-lock.json'];
    let currentPath = process.cwd();

    for (let i = 0; i < depth; i++) {
      for (const lockFile of lockFiles) {
        const filePath = path.join(currentPath, lockFile);
        if (fs.existsSync(filePath)) {
          if (lockFile === 'yarn.lock') {
            return 'yarn';
          }
          if (lockFile === 'pnpm-lock.yaml') {
            return 'pnpm';
          }
          if (lockFile === 'package-lock.json') {
            return 'npm';
          }
        }
      }
      currentPath = path.resolve(currentPath, '..');
    }
    return null;
  }

  const detectedByLockFile = detectByLockFile();
  return detectedByLockFile ?? 'npm';
}
