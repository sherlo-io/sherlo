/**
 * Reading the repository's GitHub workflows as text, for the tests that hold what CI and a release
 * do.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

// packages/react-native-storybook/src/__tests__ -> the repository root.
const WORKFLOWS_DIR = path.resolve(__dirname, '..', '..', '..', '..', '.github', 'workflows');

/**
 * A workflow's named steps, in order: each one's name and the lines of YAML under it. Text, not a
 * YAML parse - every step these tests read starts with `- name:`.
 */
export function namedStepsOf(workflowFile: string): Array<{ name: string; body: string }> {
  const workflow = fs.readFileSync(path.join(WORKFLOWS_DIR, workflowFile), 'utf8');
  return workflow
    .split(/\n(?=[ \t]+- name: )/)
    .slice(1)
    .map((stepText) => {
      const [firstLine, ...rest] = stepText.split('\n');
      const name = firstLine.replace(/^[ \t]+- name: /, '').replace(/^'(.*)'$/, '$1');
      return { name, body: rest.join('\n') };
    });
}

/** The YAML lines of a workflow that are not comments. */
export function workflowWithoutComments(workflowFile: string): string {
  return fs
    .readFileSync(path.join(WORKFLOWS_DIR, workflowFile), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
}
