import { describe, it } from 'vitest';

/** WHICH TEAM AND PROJECT SETUP USES (epic init-for-agents). Shells written in plan. */
describe('teamAndProject', () => {
  describe('the team', () => {
    it.todo('setup uses the team --team names');
    it.todo("setup uses the person's only team");
    it.todo('setup in several teams with no --team stops, listing the teams and the command that names one');
  });

  describe('the project', () => {
    it.todo('setup uses the project the config names');
    it.todo("setup names a new project from app.json's expo.name, then package.json's name, then the folder");
  });
});
