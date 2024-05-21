#!/usr/bin/env node
import { main } from './commands';

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(e.code || 1);
});
