/**
 * WHAT `sherlo init` PRINTS FOR ITS REQUIREMENTS, once every check has passed. A failed check is a
 * refusal, printed by the tool's error path, not here.
 *
 * Pure, like everything under ./: state in, print-call arguments out.
 */
import { renderCheckLine, renderSectionTitle } from './initLines';

/** The line that opens the setup, and the section's title. */
export function renderRequirementsTitle(): string[] {
  return [
    'Initializing Sherlo in your project...',
    // 15, not the title's own length: the emoji is counted as one character and drawn as two.
    ...renderSectionTitle('✅ Requirements', 15),
  ];
}

/** The two things the checks found. */
export function renderRequirementsMet(): string[] {
  return [
    renderCheckLine({ type: 'success', message: 'React Native' }),
    renderCheckLine({ type: 'success', message: 'Storybook' }),
  ];
}
