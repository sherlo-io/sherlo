/** Print lines rendered by `src/render/init*.ts`, one `console.log` each; an empty one is a blank line. */
function printLines(lines: string[]): void {
  for (const line of lines) console.log(line);
}

export default printLines;
