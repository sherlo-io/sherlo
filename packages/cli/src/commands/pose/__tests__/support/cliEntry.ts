/**
 * THE CLI'S OWN ENTRY POINT, for a process the pty ratchet starts.
 *
 * `sherlo pose` runs the routing in-process; the ratchet runs it in a REAL process attached to a
 * REAL terminal, and compares the bytes. This file is what that process runs - `start`, and
 * nothing else, so the two roads differ in exactly one thing: the terminal.
 */
import start from '../../../../start';

start();
