import runnerBridge from './runnerBridge';

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
