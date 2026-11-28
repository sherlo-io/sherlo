import { FULL_INIT_COMMAND, PROJECT_OPTION, TEAM_OPTION } from '../../constants';
import flagValue from '../shared/flagValue';

/**
 * The setup command a refusal tells the reader to run again: `npx sherlo init` with every flag
 * they typed on this run (`--team`, `--project`), so the rerun asks for what this run asked for.
 * A rerun without them would make a new project, or choose another team, than the one named.
 */
function typedInitCommand(argv: string[] = process.argv): string {
  const typedFlags = [TEAM_OPTION, PROJECT_OPTION].flatMap((name) => {
    const value = flagValue(argv, name);
    return value === undefined ? [] : [`--${name} ${shellWord(value)}`];
  });

  return [FULL_INIT_COMMAND, ...typedFlags].join(' ');
}

export default typedInitCommand;

/** The value as one shell word: as typed when the shell reads it as is, quoted otherwise. */
function shellWord(value: string): string {
  return /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}
