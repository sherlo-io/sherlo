import SherloModule from '../../SherloModule';
import {
  LogFn,
  RunnerProtocolItem,
  AckStartProtocolItem,
  AckRequestSnapshotProtocolItem,
  GetLastStateFn,
} from '../types';

function getLastState(path: string, log: LogFn): GetLastStateFn {
  return async function (): Promise<
    | {
        nextSnapshotIndex: number;
        filteredViewIds: String[];
      }
    | undefined
  > {
    try {
      const response = await SherloModule.readFile(path);
      if (response) {
        const responseLines = response.split('\n');
        let ackStart: AckStartProtocolItem | undefined;
        let lastRequestSnapshot: AckRequestSnapshotProtocolItem | undefined;

        // Iterate through all lines in reverse order
        for (let i = responseLines.length - 1; i >= 0; i--) {
          try {
            const line = responseLines[i];
            if (!line.trim()) continue;

            const responseItem = JSON.parse(line) as RunnerProtocolItem;

            if (responseItem.action === 'ACK_START' && !ackStart) {
              ackStart = responseItem;
            } else if (responseItem.action === 'ACK_REQUEST_SNAPSHOT') {
              lastRequestSnapshot = responseItem;
            }
          } catch (parseError) {
            // Ignore parse errors for invalid JSON lines
            continue;
          }
        }

        let state:
          | {
              nextSnapshotIndex: number;
              filteredViewIds: String[];
            }
          | undefined = undefined;

        if (ackStart) {
          state = {
            nextSnapshotIndex: lastRequestSnapshot
              ? lastRequestSnapshot.nextSnapshotIndex
              : ackStart.nextSnapshotIndex,
            filteredViewIds: ackStart.filteredViewIds,
          };
        }

        return state;
      }

      return undefined;
    } catch (error) {
      log('await ack message error', { error });
    }
  };
}

export default getLastState;
