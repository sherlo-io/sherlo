#!/usr/bin/env node
import main from './commands/main';

try {
  main();
} catch (error) {
  console.error((error as Error).message);
} finally {
  process.exit();
}
