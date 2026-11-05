/**
 * WHAT THE APP SAYS when a partial object is read past what the scene names. Two blocks read it:
 * the partial fields (./partialFieldLines) and the logged errors, which leave those out
 * (./loggedErrorLines).
 */

/** What the app said when a partial object was read past what the scene names; the field is the capture. */
export const PARTIAL_READ =
  /^A scene read "(.+)" of a partial object, and the scene does not name it\./;
