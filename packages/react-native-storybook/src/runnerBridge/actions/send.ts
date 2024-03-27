import sherloModule from '../../sherloModule';
import getGlobalStates from '../../utils/getGlobalStates';
import { LogFn, SendFn, RunnerProtocolItem } from '../types';

const { appendFile, readFile } = sherloModule;

const ACK_READ_INTERVAL = 500;

const send =
  (path: string, log: LogFn): SendFn =>
  async (protocolItem): Promise<RunnerProtocolItem | undefined> => {
    const content = {
      ...protocolItem,
      time: new Date().toTimeString().split(' ')[0],
      entity: 'app',
    };

    const contentString = JSON.stringify(content);

    log('appendingToProtocol', { contentString });

    await appendFile(path, `${contentString}\n`);

    return new Promise<RunnerProtocolItem | undefined>((resolve) => {
      let ackReadInterval: NodeJS.Timeout;
      let responseItem: RunnerProtocolItem | undefined;

      const resolveForTestMode = async (
        ms: number,
        mockedResponseItem: RunnerProtocolItem
      ): Promise<void> => {
        if (getGlobalStates().testConfig) {
          await new Promise<void>((r) => setTimeout(() => r(), ms));
          clearInterval(ackReadInterval);
          resolve(mockedResponseItem);
        }
      };

      ackReadInterval = setInterval(async () => {
        try {
          const response = await readFile(path);
          if (response) {
            const responseLines = response.split('\n');
            const lastLine = responseLines[responseLines.length - 2];

            responseItem = JSON.parse(lastLine) as RunnerProtocolItem;

            let hasAck = false;
            switch (protocolItem.action) {
              case 'START':
                hasAck = responseItem.action === 'ACK_START';
                await resolveForTestMode(1000, { action: 'ACK_START' });
                break;
              case 'REQUEST_SNAPSHOT':
                hasAck = responseItem.action === 'ACK_REQUEST_SNAPSHOT';
                await resolveForTestMode(1 * 1000, {
                  action: 'ACK_REQUEST_SNAPSHOT',
                  nextSnapshotIndex: protocolItem.snapshotIndex + 1,
                });
                break;
              case 'END':
                hasAck = responseItem.action === 'ACK_END';
                await resolveForTestMode(1000, { action: 'ACK_END' });
                break;
              default:
            }

            if (hasAck) {
              log('received ack message', { responseItem });
              clearInterval(ackReadInterval);
              resolve(responseItem);
            }
          }
        } catch (error) {
          log('await ack message error', { error });
        }
      }, ACK_READ_INTERVAL);
    });
  };

export default send;
