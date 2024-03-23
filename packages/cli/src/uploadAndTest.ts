#!/usr/bin/env node
import uploadAndTest from './commands/uploadAndTest';

uploadAndTest({
  gitInfo: {
    commitHash: '123456',
    branchName: 'test',
    commitName: 'Test',
  },
});
