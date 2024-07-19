import { runnerBridge } from '../helpers';

async function isSherloServer() {
  let result;

  try {
    await runnerBridge.getConfig();

    result = true;
  } catch {
    result = false;
  }

  return result;
}

export default isSherloServer;
