import * as core from '@actions/core';
import { uploadAndTest } from '@sherlo/cli';

async function run(): Promise<void> {
  try {
    const androidPath: string = core.getInput('android', { required: false });
    const iosPath: string = core.getInput('ios', { required: false });
    const config: string = core.getInput('config', { required: false });

    await uploadAndTest({
      androidPath,
      iosPath,
      config,
      token: process.env.SHERLO_TOKEN || undefined,
    });
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

run();
