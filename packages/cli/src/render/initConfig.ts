/**
 * WHAT `sherlo init` PRINTS FOR THE CONFIG FILE: its title, what happened to `sherlo.config.json`,
 * the project written into it, and the devices it was given. The file never holds a token: setup
 * logs the person in and names the project, so there is no token hint to print.
 *
 * Pure, like everything under ./: state in, print-call arguments out.
 */
import chalk from 'chalk';
import { DEVICES } from '@sherlo/shared';
import { DEFAULT_CONFIG_FILENAME, DOCS_LINK } from '../constants';
import { renderCheckLine, renderSectionTitle } from './initLines';
import { renderNotice } from './pushSpine';

export function renderConfigTitle(): string[] {
  return renderSectionTitle('📋 Config');
}

/**
 * What happened to the config file:
 *
 *     created          - there was none, and a new one was written
 *     already-created  - there was one, and it was written back with the project in place
 */
export type ConfigFileOutcome = 'created' | 'already-created';

/** The lines printed once the config file is written. */
export function renderConfigWritten({
  outcome,
  project,
  addedDevices,
}: {
  outcome: ConfigFileOutcome;
  /** The team id, a slash and the project's number, as written into the file. */
  project: string;
  /** The devices the file was given because it had none; empty when it kept its own. */
  addedDevices: { id: keyof typeof DEVICES }[];
}): string[] {
  return [
    renderCheckLine({ type: 'success', message: CONFIG_FILE_LINE[outcome] }),
    renderProjectAdded(project),
    ...(addedDevices.length > 0 ? [renderDevicesAdded(addedDevices)] : []),
  ];
}

/** The pointer printed after the section when the file was given the default devices. */
export function renderDevicesCanBeAdjusted(): string[] {
  return [
    '',
    renderNotice({
      level: 'info',
      message: 'You can adjust testing devices to match your needs',
      learnMoreLink: DOCS_LINK.configDevices,
    }),
  ];
}

/* ========================================================================== */

const CONFIG_FILE_LINE: Record<ConfigFileOutcome, string> = {
  created: `Created: ${DEFAULT_CONFIG_FILENAME}`,
  'already-created': `Already created: ${DEFAULT_CONFIG_FILENAME}`,
};

function renderProjectAdded(project: string): string {
  return renderCheckLine({
    type: 'success',
    message: `Added project ${chalk.bold(project)} to ${DEFAULT_CONFIG_FILENAME}`,
  });
}

function renderDevicesAdded(devices: { id: keyof typeof DEVICES }[]): string {
  return renderCheckLine({
    type: 'success',
    message: `Added default devices: ${devices
      .map(({ id }) => DEVICES[id].displayName)
      .join(', ')}`,
  });
}
