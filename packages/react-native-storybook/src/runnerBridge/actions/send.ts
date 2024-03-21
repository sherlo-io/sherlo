import sherloModule from '../../sherloModule';
import getGlobalStates from '../../utils/getGlobalStates';
import { LogFn, SendFn, RunnerProtocolItem } from '../types';

const { appendFile, readFile } = sherloModule;

const ACK_READ_INTERVAL = 500;

const send =
  (path: string, log: LogFn): SendFn =>
  async (protocolItem): Promise<void> => {
    const time = new Date().toTimeString().split(' ')[0];
    const timestamp = Date.now();
    const entity = 'app';
    const content = { ...protocolItem, time, entity, timestamp };
    const contentString = JSON.stringify(content);

    log('appendingToProtocol', { contentString });

    await appendFile(path, `${contentString}\n`);

    await new Promise<void>((resolve) => {
      let ackReadInterval: NodeJS.Timeout;

      const resolveForTestMode = async (ms: number): Promise<void> => {
        if (getGlobalStates().isIntegrationTest) {
          await new Promise<void>((r) => setTimeout(() => r(), ms));
          clearInterval(ackReadInterval);
          resolve();
        }
      };

      ackReadInterval = setInterval(async () => {
        try {
          const response = await readFile(path);
          if (response) {
            const responseLines = response.split('\n');
            const lastLine = responseLines[responseLines.length - 2];

            const item = JSON.parse(lastLine) as RunnerProtocolItem;

            let hasAck = false;
            switch (protocolItem.action) {
              case 'START':
                hasAck = item.action === 'ACK_START';
                await resolveForTestMode(1000);
                break;
              case 'REQUEST_SNAPSHOT':
                hasAck = item.action === 'ACK_REQUEST_SNAPSHOT';
                await resolveForTestMode(1 * 1000);
                break;
              case 'UPDATE_STATE':
                hasAck = item.action === 'ACK_UPDATE_STATE';
                await resolveForTestMode(1000);
                break;
              case 'END':
                hasAck = item.action === 'ACK_END';
                await resolveForTestMode(1000);
                break;
              default:
            }

            if (hasAck) {
              log('received ack message', { item });
              clearInterval(ackReadInterval);
              resolve();
            }
          }
        } catch (error) {
          log('await ack message error', { error });
          //
        }
      }, ACK_READ_INTERVAL);
    });

    log('received ack');
  };

export default send;
