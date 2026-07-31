import { ParsedFrame, SymbolicateStats } from '../types';
import reformatSymbolicatedLine from './reformatSymbolicatedLine';
import runMetroSymbolicate from './runMetroSymbolicate';

function symbolicateAllFrames(
  frames: ParsedFrame[],
  sourceMapPath: string,
  projectRoot: string
): { frames: ParsedFrame[] } & SymbolicateStats {
  const resolvableIndices: number[] = [];
  const inputLines: string[] = [];

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (f.file !== null && f.line !== null && f.col !== null) {
      resolvableIndices.push(i);
      inputLines.push(`    at ${f.fnName} (${f.file}:${f.line}:${f.col})`);
    }
  }

  const totalFrames = resolvableIndices.length;
  if (totalFrames === 0) {
    return { frames: frames.map((f) => ({ ...f })), totalFrames: 0, resolvedFrames: 0 };
  }

  const symLines = runMetroSymbolicate(inputLines, sourceMapPath, projectRoot);

  const result = frames.map((f) => ({ ...f }));
  let resolvedFrames = 0;

  for (let idx = 0; idx < resolvableIndices.length; idx++) {
    const frameIdx = resolvableIndices[idx];
    const rawSym = (symLines[idx] || '').trim();
    if (!rawSym) continue;

    const originalFile = frames[frameIdx].file!;
    if (rawSym.includes(originalFile)) continue; // not resolved - metro returned the same bundle path

    const reformatted = reformatSymbolicatedLine(rawSym);
    const m = /^at\s+(\S+)\s+\((.+):(\d+)(?::(\d+))?\)$/.exec(reformatted);
    if (m) {
      result[frameIdx] = {
        fnName: m[1],
        file: m[2],
        line: parseInt(m[3], 10),
        col: m[4] !== undefined ? parseInt(m[4], 10) : null,
      };
      resolvedFrames++;
    }
  }

  return { frames: result, totalFrames, resolvedFrames };
}

export default symbolicateAllFrames;
