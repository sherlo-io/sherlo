import type { UnansweredRequest } from '../sealedCore/seam';

/**
 * A request no rule answered, as the record keeps it. A refused one also says whose it is and which
 * rule refused it; the seam's type is the floor, so a core that does not read these still gets a
 * valid record. The CLI reads the same record (its `UnansweredRequest` extends this type).
 *
 * - `scope`: 'screen' when it was made after the app first rendered (the scene's own screen loading
 *   it), 'background' before that (a service started at launch).
 * - `rule`: which rule refused it: 'no-fake-matched' (no fake answered it) or 'fake-refused' (a
 *   socket fake answers 'refuse').
 * - `fakeAt`: for 'fake-refused', the call-stack line where that fake was declared; 'unknown' when
 *   the stack did not say.
 * - `stack`: the JavaScript call stack, from which the Mac names the package.
 */
export type RefusedRequest = UnansweredRequest & {
  scope?: 'screen' | 'background';
  rule?: 'no-fake-matched' | 'fake-refused';
  fakeAt?: string;
  stack?: string;
};
