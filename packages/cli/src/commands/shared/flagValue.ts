/** The value of `--name value` or `--name=value` on a command line, or undefined. */
function flagValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  if (index !== -1) return argv[index + 1];

  const joined = argv.find((word) => word.startsWith(`--${name}=`));
  return joined?.slice(`--${name}=`.length);
}

export default flagValue;
