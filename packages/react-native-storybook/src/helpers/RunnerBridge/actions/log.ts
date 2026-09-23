import SherloModule from '../../../SherloModule';
import { LogFn } from '../types';
import { pushAppLogLine } from '../captureLogSink';

function log(path: string): LogFn {
  return function (key, parameters): void {
    // Only fire when actually running under the Sherlo runner. Defense-in-depth:
    // every current caller is already inside a testing-mode-only path, but this
    // gate ensures a future call site can't accidentally leak log output into a
    // user's production app.
    if (SherloModule.getMode() !== 'testing') return;

    const time = new Date().toTimeString().split(' ')[0];
    const line = `${time}: ${key}${parameters ? ` : ${JSON.stringify(parameters)}` : ''}`;
    const logMsg = `${line}\n`;

    // Polarity is intentional: in dev builds Metro shows logs already, but in
    // release builds (the kind the runner installs into the simulator) Metro
    // isn't running and the only way to surface log lines for the runner to
    // tail is the system log (Console.app / adb logcat).
    if (!__DEV__) console.log(`${logMsg}\n`);

    // The live push a capture reads back from (../captureLogSink) - a no-op sink outside a
    // capture, so this costs a real run nothing (see captureTransport.ts).
    pushAppLogLine(line);

    SherloModule.appendFile(path, logMsg);
  };
}

export default log;
