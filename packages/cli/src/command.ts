#!/usr/bin/env node
import { main } from './commands';

main()
  .catch((e) => console.error((e as Error).message))
  .finally(() => process.exit());
