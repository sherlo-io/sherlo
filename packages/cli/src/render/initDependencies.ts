/**
 * WHAT `sherlo init` PRINTS FOR ITS DEPENDENCIES: the section's title. The install lines under it
 * are the spinners the installs drive, and a failed install is a refusal printed by the tool's
 * error path.
 *
 * Pure, like everything under ./: state in, print-call arguments out.
 */
import { renderSectionTitle } from './initLines';

export function renderDependenciesTitle(): string[] {
  return renderSectionTitle('💾 Dependencies');
}
