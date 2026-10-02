/**
 * WHAT `sherlo init` PRINTS FOR THE CONFIG FILE: its title, what happened to `sherlo.config.json`,
 * the hint when it holds no token, and the devices it was given.
 *
 * Pure, like everything under ./: state in, print-call arguments out.
 */
import { DEVICES } from '@sherlo/shared';
import { APP_DOMAIN, DEFAULT_CONFIG_FILENAME, DOCS_LINK } from '../constants';
import { renderCheckLine, renderSectionTitle } from './initLines';
import { renderNotice } from './pushSpine';

export function renderConfigTitle(): string[] {
  return renderSectionTitle('📋 Config');
}

/**
 * What happened to the config file:
 *
 *     created          - there was none, and a new one was written
 *     token-updated    - there was one, and the given token replaced the one it held
 *     already-created  - there was one, and it was written back as it was
 */
export type ConfigFileOutcome = 'created' | 'token-updated' | 'already-created';

/** The lines printed once the config file is written. */
export function renderConfigWritten({
  outcome,
  hasToken,
  addedDevices,
}: {
  outcome: ConfigFileOutcome;
  /** Whether the file, as written, holds a token. */
  hasToken: boolean;
  /** The devices the file was given because it had none; empty when it kept its own. */
  addedDevices: { id: keyof typeof DEVICES }[];
}): string[] {
  return [
    renderCheckLine({ type: 'success', message: CONFIG_FILE_LINE[outcome] }),
    ...(hasToken ? [] : [renderNoTokenHint()]),
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
  'token-updated': `Updated token: ${DEFAULT_CONFIG_FILENAME}`,
  'already-created': `Already created: ${DEFAULT_CONFIG_FILENAME}`,
};

/** A config file with no token cannot push, so it says how to get one and where it goes. */
function renderNoTokenHint(): string {
  return renderNotice({
    level: 'warning',
    message:
      `\`npx sherlo test\` needs a project token, and ${DEFAULT_CONFIG_FILENAME} has none yet\n` +
      `Get one at ${APP_DOMAIN}, then run \`npx sherlo init --token <token>\` or add it as "token" in ${DEFAULT_CONFIG_FILENAME}`,
    learnMoreLink: DOCS_LINK.configToken,
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
