import RunnerBridge from './RunnerBridge2';

async function isSherloServer() {
  let result;

  try {
    await RunnerBridge.getConfig();

    result = true;
  } catch {
    result = false;
  }

  return result;
}

export default isSherloServer;
