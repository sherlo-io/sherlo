import process from 'process';

function getSherloBuildProfile(): string | null {
  const flagPrefix = '--';
  const flagName = 'profile';
  const flag = [flagPrefix, flagName].join('');

  const args = process.argv.slice(3);

  for (let i = 0; i < args.length; i++) {
    const currentArgument = args[i];
    const nextArgument = args[i + 1];

    if (currentArgument.startsWith(`${flag}=`)) {
      const value = currentArgument.split('=')[1];

      return value;
    } else if (currentArgument === flag) {
      if (nextArgument && !nextArgument.startsWith(flagPrefix)) {
        const value = nextArgument;

        return value;
      }
    }
  }

  return null;
}

export default getSherloBuildProfile;
