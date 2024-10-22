import { getGlobalStates } from '../../../utils';
import SherloModule from '../../SherloModule';
import { LogFn, SendFn, RunnerProtocolItem, AppProtocolItem, ProtocolItemMetadata } from '../types';

const ACK_READ_INTERVAL = 500;

function send(path: string, log: LogFn): SendFn {
  return async function (protocolItem): Promise<RunnerProtocolItem> {
    const content: AppProtocolItem & ProtocolItemMetadata = {
      ...protocolItem,
      timestamp: Date.now(),
      entity: 'app',
    };

    const contentString = JSON.stringify(content);

    log('appendingToProtocol', { contentString });

    await SherloModule.appendFile(path, `${contentString}\n`);

    return new Promise<RunnerProtocolItem>((resolve) => {
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
          const response = await SherloModule.readFile(path);
          if (response) {
            const responseLines = response.split('\n');
            const lastLine = responseLines[responseLines.length - 2];

            responseItem = JSON.parse(lastLine) as RunnerProtocolItem;

            let hasAck = false;
            switch (protocolItem.action) {
              case 'START':
                hasAck = responseItem.action === 'ACK_START';
                await resolveForTestMode(1000, {
                  action: 'ACK_START',
                  nextSnapshotIndex: 0,
                  filteredViewIds: protocolItem.snapshots.map((snapshot) => snapshot.viewId),
                });
                break;
              case 'REQUEST_SNAPSHOT':
                hasAck = responseItem.action === 'ACK_REQUEST_SNAPSHOT';
                await resolveForTestMode(1 * 1000, {
                  action: 'ACK_REQUEST_SNAPSHOT',
                  nextSnapshotIndex: protocolItem.snapshotIndex + 1,
                });
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
}

export default send;
