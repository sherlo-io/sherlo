/**
 * What `sherlo suggest` offers by the scenes flag: both kinds with scenes on, stories only off, and
 * the top of the list holding one of each kind when there is one.
 */
import { describe, expect, it } from 'vitest';
import { suggestItems, topOfEachKind, type SuggestItem } from '../suggestItems';

const button = `
import React, { useState } from 'react';
export function Button() {
  const [pressed, setPressed] = useState(false);
  return <button onClick={() => setPressed(!pressed)}>{String(pressed)}</button>;
}
`;
const screen = (name: string) => `
import React, { useState } from 'react';
import { Button } from '../parts/Button';
export default function ${name}() {
  const [open, setOpen] = useState(false);
  return <div onClick={() => setOpen(!open)}>{open ? <p>${name}</p> : <Button />}</div>;
}
`;

const files = [
  { path: 'src/parts/Button.tsx', text: button },
  { path: 'src/screens/Home.tsx', text: screen('Home') },
  { path: 'src/screens/Profile.tsx', text: screen('Profile') },
];

const offered = (scenes: boolean) =>
  suggestItems({ files, history: new Map(), variants: new Map(), scenes }).items;

describe('suggestItems by the scenes flag', () => {
  it('with scenes on, offers the screens as scenes and the shared part as a story', () => {
    const kinds = new Map(offered(true).map((item) => [item.file, item.kind]));

    expect(kinds.get('src/screens/Home.tsx')).toBe('scene');
    expect(kinds.get('src/parts/Button.tsx')).toBe('story');
  });

  it('with scenes off, offers stories only, the screens included', () => {
    const items = offered(false);

    expect(items.map((item) => item.file).sort()).toEqual([
      'src/parts/Button.tsx',
      'src/screens/Home.tsx',
      'src/screens/Profile.tsx',
    ]);
    expect(items.every((item) => item.kind === 'story')).toBe(true);
    expect(JSON.stringify(items)).not.toMatch(/scene/i);
  });
});

describe('the top of the suggested list', () => {
  const item = (kind: SuggestItem['kind'], name: string): SuggestItem => ({
    kind,
    name,
    file: `src/${name}.tsx`,
    reason: 'changed often',
    source: 'rule',
    score: 1,
  });

  it('gives the last place to the best item of a kind the top lacks', () => {
    const items = [item('scene', 'a'), item('scene', 'b'), item('scene', 'c'), item('story', 'd')];

    expect(topOfEachKind(items, 3).map((one) => one.name)).toEqual(['a', 'b', 'd']);
  });

  it('changes nothing when the top holds both kinds, or the list holds one kind', () => {
    const mixed = [item('scene', 'a'), item('story', 'b'), item('scene', 'c')];
    expect(topOfEachKind(mixed, 2).map((one) => one.name)).toEqual(['a', 'b']);

    const storiesOnly = [item('story', 'a'), item('story', 'b'), item('story', 'c')];
    expect(topOfEachKind(storiesOnly, 2).map((one) => one.name)).toEqual(['a', 'b']);
  });
});

describe('the items setup suggests', () => {
  it.todo(
    'a screen a route map requires lazily, through a re-exporting index file, ranks as a route, not unsure'
  );
});
