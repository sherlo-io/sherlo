/**
 * THE COVERAGE COMMAND - each case below is named, and empty until the scan is written.
 */
import { describe, it } from 'vitest';

describe('sherlo coverage lists what no story covers', () => {
  it.todo('lists a component no story file imports, ranked by importing files');
  it.todo('passes barrel re-exports when deciding a story imports a component');
  it.todo('marks a gap only an excluded story imports');
  it.todo("counts a prop value a story's args set");
  it.todo('counts a prop value written on the component inside its story file');
  it.todo('does not follow a helper defined in another file');
  it.todo('lists missing values of a prop with at most 10 values');
  it.todo('shows a count line for a prop with more than 10 values');
});
