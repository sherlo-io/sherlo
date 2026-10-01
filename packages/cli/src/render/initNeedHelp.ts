/**
 * WHAT `sherlo init`'S HELP SECTION PRINTS: where to ask. No step of the setup prints it today
 * (its progress event, `8_need_help`, is in the code and nothing sends it); it is kept here so its
 * words live with the rest of the setup's.
 *
 * Pure, like everything under ./: state in, print-call arguments out.
 */
import chalk from 'chalk';
import { CONTACT_EMAIL, DISCORD_URL } from '../constants';
import { renderSectionTitle } from './initLines';

export function renderNeedHelp(): string[] {
  return [
    ...renderSectionTitle('🤝 Need Help?'),
    'Help is just a message away!',
    '',
    '- Discord: ' + chalk.blue(DISCORD_URL),
    '- Email: ' + chalk.blue(CONTACT_EMAIL),
    '',
  ];
}
