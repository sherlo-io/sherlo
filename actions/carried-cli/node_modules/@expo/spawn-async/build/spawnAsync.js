"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const buffer_1 = require("buffer");
const cross_spawn_1 = __importDefault(require("cross-spawn"));
const DEFAULT_MAX_BUFFER = buffer_1.constants.MAX_STRING_LENGTH;
function spawnAsync(command, args, options = {}) {
    const stubError = new Error();
    const callerStack = stubError.stack ? stubError.stack.replace(/^.*/, '    ...') : null;
    const { ignoreStdio: optionsIgnoreStdio, maxBuffer: optionsMaxBuffer, ...nodeOptions } = options;
    // NOTE(@kitten): When `maxBuffer` is set explicitly, we enforce it strictly
    // and don't produce a result without it being strictly enforced
    const enforceMaxBufferStrictly = optionsMaxBuffer != null;
    const ignoreStdio = !!optionsIgnoreStdio;
    const maxBuffer = Math.min(optionsMaxBuffer !== null && optionsMaxBuffer !== void 0 ? optionsMaxBuffer : DEFAULT_MAX_BUFFER, buffer_1.constants.MAX_STRING_LENGTH);
    let child = (0, cross_spawn_1.default)(command, args, nodeOptions);
    let promise = new Promise((resolve, reject) => {
        var _a, _b;
        const stdoutChunks = { buffer: [], maxExceeded: false };
        const stderrChunks = { buffer: [], maxExceeded: false };
        function makeHandler(chunks) {
            let length = 0;
            return (chunk) => {
                chunks.buffer.push(chunk);
                length += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.byteLength;
                while (chunks.buffer.length > 0 && length > maxBuffer) {
                    chunks.maxExceeded = true;
                    chunk = chunks.buffer[0];
                    const chunkLength = typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.byteLength;
                    if (length - chunkLength < maxBuffer) {
                        const replacement = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
                        const excess = length - maxBuffer;
                        chunks.buffer[0] = replacement.subarray(excess);
                        length -= excess;
                        break;
                    }
                    else {
                        chunks.buffer.shift();
                        length -= chunkLength;
                    }
                }
            };
        }
        function attachResult(target, assign, stdoutChunks, stderrChunks, skipMaxBufferCheck) {
            function makeMaxBufferError() {
                const argumentString = args && args.length > 0 ? ` ${args.join(' ')}` : '';
                const error = new Error(`${command}${argumentString} exceeded maxBuffer of ${maxBuffer} bytes`);
                error.code = 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
                return attachResult(error, assign, stdoutChunks, stderrChunks, true);
            }
            let _stdout;
            let _stderr;
            const map = {
                stdout: {
                    enumerable: true,
                    configurable: true,
                    get() {
                        if (!skipMaxBufferCheck && stdoutChunks.maxExceeded) {
                            throw makeMaxBufferError();
                        }
                        else if (_stdout === undefined) {
                            _stdout = Buffer.concat(stdoutChunks.buffer.map((chunk) => typeof chunk === 'string' ? Buffer.from(chunk) : chunk)).toString('utf8');
                        }
                        return _stdout;
                    },
                },
                stderr: {
                    enumerable: true,
                    configurable: true,
                    get() {
                        if (!skipMaxBufferCheck && stderrChunks.maxExceeded) {
                            throw makeMaxBufferError();
                        }
                        else if (_stderr === undefined) {
                            _stderr = Buffer.concat(stderrChunks.buffer.map((chunk) => typeof chunk === 'string' ? Buffer.from(chunk) : chunk)).toString('utf8');
                        }
                        return _stderr;
                    },
                },
                output: {
                    enumerable: true,
                    configurable: true,
                    get: () => [target.stdout, target.stderr],
                },
            };
            for (const key in assign) {
                map[key] = {
                    value: assign[key],
                    enumerable: true,
                    writable: true,
                    configurable: true,
                };
            }
            Object.defineProperties(target, map);
            return target;
        }
        if (!ignoreStdio) {
            (_a = child.stdout) === null || _a === void 0 ? void 0 : _a.on('data', makeHandler(stdoutChunks));
            (_b = child.stderr) === null || _b === void 0 ? void 0 : _b.on('data', makeHandler(stderrChunks));
        }
        // Use 'exit' instead of 'close' when there are no piped stdio streams for us to drain;
        // 'close' can be deferred past 'exit' when the child has grandchildren that inherit its
        // stdio fds, so waiting on it without anything to read just stalls
        const completionEvent = ignoreStdio || (!child.stdout && !child.stderr) ? 'exit' : 'close';
        let completionListener = (code, signal) => {
            child.removeListener('error', errorListener);
            const argumentString = args && args.length > 0 ? ` ${args.join(' ')}` : '';
            let error = null;
            if (code !== 0) {
                error = signal
                    ? new Error(`${command}${argumentString} exited with signal: ${signal}`)
                    : new Error(`${command}${argumentString} exited with non-zero code: ${code}`);
            }
            const assignResult = {
                pid: child.pid,
                status: code,
                signal,
            };
            if (error) {
                if (error.stack && callerStack)
                    error.stack += `\n${callerStack}`;
                // When we're already rejecting, we don't enforce the max buffer error, and accept that we
                // may truncate stderr/stdout
                reject(attachResult(error, assignResult, stdoutChunks, stderrChunks, true));
            }
            else if (enforceMaxBufferStrictly && (stdoutChunks.maxExceeded || stderrChunks.maxExceeded)) {
                // When a `maxBuffer` is passed, we enforce the maximum on stdout and stderr strictly
                const error = new Error(`${command}${argumentString} exceeded maxBuffer of ${maxBuffer} bytes`);
                error.code = 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
                reject(attachResult(error, assignResult, stdoutChunks, stderrChunks, true));
            }
            else {
                const result = {};
                resolve(attachResult(result, assignResult, stdoutChunks, stderrChunks));
            }
        };
        let errorListener = (error) => {
            child.removeListener(completionEvent, completionListener);
            const assignResult = {
                pid: child.pid,
                status: null,
                signal: null,
            };
            reject(attachResult(error, assignResult, stdoutChunks, stderrChunks));
        };
        child.once(completionEvent, completionListener);
        child.once('error', errorListener);
    });
    promise.child = child;
    return promise;
}
module.exports = spawnAsync;
//# sourceMappingURL=spawnAsync.js.map