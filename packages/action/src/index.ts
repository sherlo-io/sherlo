import * as core from '@actions/core';
import { uploadAndTest } from '@sherlo/cli';

async function run(): Promise<void> {
  try {
    const android: string = core.getInput('android', { required: false });
    const ios: string = core.getInput('ios', { required: false });
    const config: string = core.getInput('config', { required: false });

    await uploadAndTest({ android, ios, config: config });
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

run();
