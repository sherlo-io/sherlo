import * as fs from 'fs';
import chalk from 'chalk';
import { beforeAll, it } from 'vitest';
import type { CapturedStory, CapturedView } from '../capturedStory';

let renderCapturedStory: (state: CapturedStory) => string[];
beforeAll(async () => {
  ({ renderCapturedStory } = await import('../capturedStory'));
});

const OUT =
  '/private/tmp/claude-501/-Users-michalziolkowski-sherlo-workspace-sherlo-brain--worktrees-capture-screen-is-the-inspectors-sherlo/05ba87d8-0635-4e0a-a211-df07e29621e8/scratchpad/dump2.txt';

function dump(name: string, tree: CapturedView) {
  const lines = renderCapturedStory({
    kind: 'captured',
    storyId: 'x',
    settledMs: 1000,
    frames: 1,
    tree,
  });
  fs.appendFileSync(OUT, `\n=== ${name} ===\n` + lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
}

it('dump', () => {
  fs.writeFileSync(OUT, '');

  dump('200-view chain', {
    primitive: 'View',
    components: [],
    children: Array.from({ length: 199 }, (_, i) => ({
      primitive: 'View',
      components: [],
      size: { width: i, height: 1 },
      children: [],
    })),
  });

  dump('one-line vs multi-line', {
    primitive: 'View',
    components: [],
    children: [
      { primitive: 'View', components: [], children: [] },
      {
        primitive: 'View',
        components: [],
        props: { testID: 'button' },
        children: [],
      },
    ],
  });

  dump('size after opening tag', {
    primitive: 'View',
    components: [],
    size: { width: 100, height: 40 },
    children: [],
  });

  dump('colour uppercase hex', {
    primitive: 'View',
    components: [],
    style: { backgroundColor: '#f00' },
    children: [],
  });

  dump('text between tags', {
    primitive: 'Text',
    components: [],
    text: 'Hello',
    children: [],
  });

  dump('placeholder as prop', {
    primitive: 'TextInput',
    components: [],
    props: { placeholder: 'Email' },
    children: [],
  });

  dump('components wrap', {
    primitive: 'View',
    components: ['Outer', 'Inner'],
    children: [],
  });

  dump('no component names', {
    primitive: 'View',
    components: [],
    children: [],
  });

  dump('props but no style multiline', {
    primitive: 'View',
    components: [],
    props: { testID: 'card', numberOfLines: 2 },
    children: [],
  });

  dump('boolean prop', {
    primitive: 'View',
    components: [],
    props: { disabled: true },
    children: [],
  });

  dump('style order', {
    primitive: 'View',
    components: [],
    style: { shadowOpacity: 0.5, fontSize: 12, width: 100, position: 'absolute' },
    children: [],
  });

  dump('style shorthand fold', {
    primitive: 'View',
    components: [],
    style: {
      paddingTop: 8,
      paddingRight: 8,
      paddingBottom: 8,
      paddingLeft: 8,
      borderTopLeftRadius: 4,
      borderTopRightRadius: 4,
      borderBottomRightRadius: 4,
      borderBottomLeftRadius: 4,
    },
    children: [],
  });
});
