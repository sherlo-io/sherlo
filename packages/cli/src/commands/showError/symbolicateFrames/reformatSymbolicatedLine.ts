// metro-symbolicate outputs frames in two formats:
//   standard:  at <fn> (<source>:<line>:<col>)       — colOrName is numeric
//   recovered: at <minFn> (<source>:<line>:<fnName>) — colOrName is a function name
// In both cases the source may have a leading "/" that should be stripped.
function reformatSymbolicatedLine(rawLine: string): string {
  const line = rawLine.trim();
  const m = /^at\s+(\S+)\s+\((.+):(\d+):([^):]+)\)$/.exec(line);
  if (!m) return line;
  const [, , source, lineNum, colOrName] = m;
  const cleanSource = source.replace(/^\//, '');
  if (/^\d+$/.test(colOrName)) {
    return `at ${m[1]} (${cleanSource}:${lineNum}:${colOrName})`;
  }
  // Function name in column position. metro-symbolicate does not emit the original source column
  // in this format — file:line is sufficient for navigation, so we leave col out.
  return `at ${colOrName} (${cleanSource}:${lineNum})`;
}

export default reformatSymbolicatedLine;
