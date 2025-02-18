import SherloModule from '../../SherloModule';

async function sendHeartbeat(path: string): Promise<void> {
  await SherloModule.appendFile(path, `${Date.now()}\n`);
}

export default sendHeartbeat;
