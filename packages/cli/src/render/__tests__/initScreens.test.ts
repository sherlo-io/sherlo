/**
 * THE INIT SCREENS NO COMMITTED POSE DRAWS, PINNED BYTE FOR BYTE.
 *
 * `sherlo init` prints through the `init*.ts` renderers beside ../. The committed init poses
 * (packages/cli/poses/init/) and the setup storylines already hold every line a setup prints, colour
 * and all, so they are not repeated here. What none reaches is a config file whose token was
 * replaced - so that block is written out below, every escape spelled, the way
 * ./renderLayerLiterals.test.ts pins segments.
 */
import chalk from 'chalk';
import { beforeAll, describe, expect, it } from 'vitest';

const ESC = '\u001b';

type InitRenderers = typeof import('../initConfig');
let render: InitRenderers;

beforeAll(async () => {
  // Colour pinned before the first import of a renderer, as ./renderLayerLiterals.test.ts does.
  chalk.level = 1;
  render = await import('../initConfig');
});

describe('the init screens no pose draws', () => {
  it('a config file that kept its own devices says it was already created and names the project', () => {
    expect(
      render.renderConfigWritten({
        outcome: 'already-created',
        project: 'k3j9x2ab/4',
        addedDevices: [],
      })
    ).toEqual([
      `${ESC}[32m✔${ESC}[39m Already created: sherlo.config.json`,
      `${ESC}[32m✔${ESC}[39m Added project ${ESC}[1mk3j9x2ab/4${ESC}[22m to sherlo.config.json`,
    ]);
  });
});
