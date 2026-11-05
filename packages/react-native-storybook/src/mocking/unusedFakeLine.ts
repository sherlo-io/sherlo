/**
 * THE DIAGNOSTIC LINES a scene logs about its own fakes, and the one place their forms are defined.
 * The app logs them, the logged errors carry them to the Mac (src/loggedErrors keeps them apart from
 * the app's real errors), and the CLI reads them back into the scene's record (cli/src/seams/
 * readAppAnswer, cli/src/render/partialRead).
 */

/** What the app logs for a fake of `moduleName` that no read reached, and the layer that declared it. */
export function unusedFakeLine(moduleName: string, layer: string): string {
  return `The fake of ${moduleName} was never used, declared in ${layer}.`;
}

/** The line read back: the module is the first capture, the layer the second. */
export const UNUSED_FAKE_LINE = /^The fake of (.+) was never used, declared in (.+)\.$/;

/** What the app logs when a partial object is read for a field the scene does not name. */
export function partialReadLine(field: string): string {
  return `A scene read "${field}" of a partial object, and the scene does not name it. Add it to the partial.`;
}

/** The partial-read line read back; the field is the capture. */
export const PARTIAL_READ_LINE =
  /^A scene read "(.+)" of a partial object, and the scene does not name it\./;

/** Whether a logged message is one of these lines and not an error of the app's own. */
export function isDiagnosticLine(message: string): boolean {
  return UNUSED_FAKE_LINE.test(message) || PARTIAL_READ_LINE.test(message);
}
