function getCwd(): string {
  /**
   * Use INIT_CWD to get the actual directory where command was run
   * Package managers like yarn change process.cwd() to the directory with package.json
   * but we want to use the directory where user actually ran the command
   */
  return process.env.INIT_CWD ?? process.cwd();
}

export default getCwd;
