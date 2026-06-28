import start from './start';

export * as commands from './commands';
export * as constants from './constants';

// SHERLO-1506 gate verification (TRANSIENT - reverted next commit)
const __sherlo1506TypecheckProbe: number = 'intentional type error';

export default start;
