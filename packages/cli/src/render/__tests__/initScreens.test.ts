/**
 * THE INIT SCREENS NO COMMITTED POSE DRAWS, PINNED BYTE FOR BYTE.
 *
 * `sherlo init` prints through the `init*.ts` renderers beside ../. The three committed init poses
 * (packages/cli/poses/init/) already hold every line a first, a second and an abandoned setup
 * print, colour and all, so they are not repeated here. What no pose reaches is a Metro config the
 * rewrite could not handle, and a config file whose token was replaced - so those blocks are
 * written out below, every escape spelled, the way ./renderLayerLiterals.test.ts pins segments.
 */
import chalk from 'chalk';
import { beforeAll, describe, expect, it } from 'vitest';

const ESC = '\u001b';

type InitRenderers = typeof import('../initMetroConfig') & typeof import('../initConfig');
let render: InitRenderers;

beforeAll(async () => {
  // Colour pinned before the first import of a renderer, as ./renderLayerLiterals.test.ts does.
  chalk.level = 1;
  render = { ...(await import('../initMetroConfig')), ...(await import('../initConfig')) };
});

const METRO_CONFIG = '/app/metro.config.js';
const STORYBOOK_SETUP_LINK = 'https://github.com/storybookjs/react-native#setup';

/** A warning notice: the yellow sentence, then its dimmed, underlined link. */
function warning(message: string, link: string): string {
  return (
    `${ESC}[33mWARNING: ${message}${ESC}[39m\n` +
    `${ESC}[2m↳ Learn more: ${ESC}[4m${link}${ESC}[24m${ESC}[22m`
  );
}

describe('the init screens no pose draws', () => {
  it('a folder with no Metro config gets the warning that sends it back to Storybook setup', () => {
    expect(render.renderMetroConfigNotFound()).toEqual([
      warning('metro.config.js not found - complete Storybook setup first', STORYBOOK_SETUP_LINK),
    ]);
  });

  it('a Metro config with no withStorybook call gets a red cross and the same pointer', () => {
    expect(render.renderMetroConfigWithoutWithStorybook(METRO_CONFIG)).toEqual([
      `${ESC}[31m✖${ESC}[39m /app/metro.config.js has no withStorybook(...) call`,
      warning('Complete Storybook integration in metro.config.js first', STORYBOOK_SETUP_LINK),
    ]);
  });

  it('a Metro config the rewrite cannot read gets a red cross and the edit to make by hand', () => {
    expect(render.renderMetroConfigNeedsManualEdit(METRO_CONFIG)).toEqual([
      `${ESC}[31m✖${ESC}[39m Could not automatically update /app/metro.config.js`,
      warning(
        'metro.config.js has a non-standard shape - add withStorybook from @sherlo/react-native-storybook/metro/withStorybook manually',
        'https://sherlo.io/docs/setup#metro-config'
      ),
    ]);
  });

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
