import { send } from '../../../connection/appLine';
import SherloModule from '../../../SherloModule';
import type { LogFn } from '../../../sealedCore/seam';
import { pushAppLogLine } from '../captureLogSink';

/** Form one log line, and send it over the connection. Outside testing mode, nothing happens. */
const log: LogFn = function (key, parameters): void {
  // Only fire when actually running under the Sherlo runner. Defense-in-depth:
  // every current caller is already inside a testing-mode-only path, but this
  // gate ensures a future call site can't accidentally leak log output into a
  // user's production app.
  if (SherloModule.getMode() !== 'testing') return;

  const time = new Date().toTimeString().split(' ')[0];
  const line = `${time}: ${key}${parameters ? ` : ${JSON.stringify(parameters)}` : ''}`;

  // Polarity is intentional: in dev builds Metro shows logs already, but in
  // release builds (the kind the runner installs into the simulator) Metro
  // isn't running and the system log (Console.app / adb logcat) is the one
  // place left to read a line from outside the connection.
  if (!__DEV__) console.log(`${line}\n`);

  // A sink a core plugged in (../captureLogSink), if any - a no-op otherwise.
  pushAppLogLine(line);

  // The road a run's runner and a bundler's `sherlo capture` both read each line from.
  send({ action: 'log', line });
};

export default log;
