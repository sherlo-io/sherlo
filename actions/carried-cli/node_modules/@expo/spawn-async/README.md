# spawn-async [![Tests](https://github.com/expo/spawn-async/actions/workflows/main.yml/badge.svg)](https://github.com/expo/spawn-async/actions/workflows/main.yml)

A cross-platform version of Node's `child_process.spawn` as an async function that returns a promise. Supports Node 12 LTS and up.

## Usage:
```js
import spawnAsync from '@expo/spawn-async';

(async function () {
  let resultPromise = spawnAsync('echo', ['hello', 'world']);
  let spawnedChildProcess = resultPromise.child;
  try {
    let {
      pid,
      output: [stdout, stderr],
      stdout,
      stderr,
      status,
      signal,
    } = await resultPromise;
  } catch (e) {
    console.error(e.stack);
    // The error object also has the same properties as the result object
  }
})();
```

## API

`spawnAsync` takes the same arguments as [`child_process.spawn`](https://nodejs.org/api/child_process.html#child_process_child_process_spawn_command_args_options). Its options are the same as those of `child_process.spawn` plus:

- `ignoreStdio`: whether to ignore waiting for the child process's stdio streams to close before resolving the result promise. When ignoring stdio, the returned values for `stdout` and `stderr` will be empty strings. The default value of this option is `false`.
- `maxBuffer`: the maximum bytes retained from `stdout` and `stderr` (independently). Output is collected with a sliding window. When set explicitly, exceeding it rejects the promise with an error whose `code` is `ERR_CHILD_PROCESS_STDIO_MAXBUFFER` and whose `stdout`/`stderr` carry the truncated tail. When omitted, the default is `buffer.constants.MAX_STRING_LENGTH` (~512 MiB).

It returns a promise whose result is an object with these properties:

- `pid`: the process ID of the spawned child process
- `output`: an array with stdout and stderr's output
- `stdout`: a string of what the child process wrote to stdout
- `stderr`: a string of what the child process wrote to stderr
- `status`: the exit code of the child process
- `signal`: the signal (ex: `SIGTERM`) used to stop the child process if it did not exit on its own

If there's an error running the child process or it exits with a non-zero status code, `spawnAsync` rejects the returned promise. The Error object also has the properties listed above.

### Accessing the child process

Sometimes you may want to access the child process object--for example, if you wanted to attach event handlers to `stdio` or `stderr` and process data as it is available instead of waiting for the process to be resolved.

You can do this by accessing `.child` on the Promise that is returned by `spawnAsync`.

Here is an example:
```js
(async () => {
  let ffmpeg$ = spawnAsync('ffmpeg', ['-i', 'path/to/source.flac', '-codec:a', 'libmp3lame', '-b:a', '320k', '-ar', '44100', 'path/to/output.mp3']);
  let childProcess = ffmpeg$.child;
  childProcess.stdout.on('data', (data) => {
    console.log(`ffmpeg stdout: ${data}`);
  });
  childProcess.stderr.on('data', (data) => {
    console.error(`ffmpeg stderr: ${data}`);
  });
  let result = await ffmpeg$;
  console.log(`ffmpeg pid ${result.pid} exited with code ${result.code}`);
})();

```

## Notes

### `maxBuffer`

`maxBuffer` is a later addition to the API. Set it when child output could exhaust memory and crash the parent process, or when the command or arguments are influenced by untrusted input — an attacker can otherwise force unbounded output to crash the parent.

The default of `buffer.constants.MAX_STRING_LENGTH` (~512 MiB) is a crash-safe floor, not a memory bound: at that size the materialized string itself can still exhaust process memory.

When `maxBuffer` is set explicitly, exceeding it rejects the promise immediately with `ERR_CHILD_PROCESS_STDIO_MAXBUFFER`. When left at the default, exceeding it doesn't reject; the sliding-window tail is still readable, but reading `stdout`/`stderr` throws `ERR_CHILD_PROCESS_STDIO_MAXBUFFER` with the truncated tail attached.
