/**
 * WHAT `sherlo feedback` REFUSES, WHAT IT SENDS, AND WHAT IT NEVER SENDS (sherlo / Sending feedback).
 */
import { describe, it } from 'vitest';

// Shells for epic sherlo-feedback. Each `it.todo` becomes a real `it(...)` with the exact same name.
describe('sherlo feedback', () => {
  it.todo('Once the report is stored, it prints a thank-you, the reference and what was sent with it');

  it.todo("A report missing a section its type needs is refused once, naming the type's sections and every one missing");

  it.todo('The word unknown under a heading answers that section');

  it.todo('A report under 10 or over 4,000 characters is refused');

  it.todo(
    'No type, or a type that does not exist, is refused with the four types and their sections, the words its help prints'
  );

  it.todo('A report that reaches the command as more than one word is refused, naming the quoted here-document');

  it.todo('A dash with nothing piped in is refused');

  it.todo(
    'Nothing else leaves the machine: no token, no saved login, no environment value, nothing from the config beyond the project and its devices, and no agent session id'
  );

  it.todo('Anything shaped like a token or a key is blanked out before it is sent, and a dry run shows it blanked');

  it.todo('A dry run prints the report and everything sent with it, sends nothing and needs no login');

  it.todo('Without a saved login the report is refused, naming npx sherlo login');

  it.todo('When the service cannot be reached the report is refused, nothing is sent, and it asks to send it again');
});
