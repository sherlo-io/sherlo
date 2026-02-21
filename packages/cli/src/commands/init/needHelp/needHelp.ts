import chalk from 'chalk';
import { CONTACT_EMAIL, DISCORD_URL } from '../../../constants';
import { printTitle, trackProgress } from '../helpers';
import { EVENT } from './constants';

async function needHelp(sessionId: string | null): Promise<void> {
  printTitle('🤝 Need Help?');

  console.log('Help is just a message away!');

  console.log();

  console.log('- Discord: ' + chalk.blue(DISCORD_URL));
  console.log('- Email: ' + chalk.blue(CONTACT_EMAIL));

  console.log();

  await trackProgress({
    event: EVENT,
    params: { seen: true },
    sessionId,
    hasFinished: true,
  });
}

export default needHelp;
