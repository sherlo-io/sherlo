const { exec } = require('child_process');

const isRemoteBuild = process.env.EAS_BUILD_RUNNER === 'eas-build';

if (isRemoteBuild) {
  exec('yarn --cwd ../../ switch-env:dev');
}
