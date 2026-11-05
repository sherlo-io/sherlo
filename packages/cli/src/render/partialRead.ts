/**
 * WHAT THE APP SAYS when a partial object is read past what the scene names. Two blocks read it:
 * the partial fields (./partialFieldLines) and the logged errors, which leave those out
 * (./loggedErrorLines). The form is defined once, in the app's package.
 */
import { PARTIAL_READ_LINE } from '../../../react-native-storybook/src/mocking/unusedFakeLine';

/** What the app said when a partial object was read past what the scene names; the field is the capture. */
export const PARTIAL_READ = PARTIAL_READ_LINE;
