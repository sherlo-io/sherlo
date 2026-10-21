import { describe, expect, it } from 'vitest';
import { readDrawnProps } from '../drawnProps';

function fiber(tag: number, type: unknown, props: object, child?: any, sibling?: any): any {
  return { tag, type, memoizedProps: props, pendingProps: props, child, sibling };
}

function Button() {}
function Label() {}

describe('readDrawnProps', () => {
  it('records primitive props of project components and "present" for functions and objects', () => {
    const label = fiber(0, Label, { children: 'Go' });
    const host = fiber(5, 'View', { style: {} }, label);
    const button = fiber(0, Button, { variant: 'primary', size: 3, disabled: false, onPress() {}, style: {} }, host);
    const story = fiber(0, function Story() {}, {}, button);

    const drawn = readDrawnProps(story);

    expect(drawn.map((d) => d.component)).toEqual(['Story', 'Button', 'Label']);
    expect(drawn[1].props).toEqual({
      variant: 'primary',
      size: 3,
      disabled: false,
      onPress: 'present',
      style: 'present',
    });
  });

  it('joins a component to the module that exports it, preferring the file named like it', () => {
    const story = fiber(0, Button, { size: 'small' });
    const modules = new Map<number, any>([
      [1, { isInitialized: true, verboseName: 'src/components/index.ts', publicModule: { exports: { Button } } }],
      [2, { isInitialized: true, verboseName: 'src/components/Button.tsx', publicModule: { exports: { default: Button } } }],
      [3, { isInitialized: false, verboseName: 'src/never.ts', publicModule: { exports: { Button } } }],
    ]);

    const [only] = readDrawnProps(story, modules);

    expect(only.file).toBe('src/components/Button.tsx');
    expect(only.files).toEqual(['src/components/index.ts', 'src/components/Button.tsx']);
  });

  it('flags a component that only node_modules exports, and walks forwardRef and memo', () => {
    const render = function Inner() {};
    const forward = { $$typeof: 'forward_ref', render };
    const memoed = { $$typeof: 'memo', type: Label };
    const modules = {
      a: { isInitialized: true, verboseName: 'node_modules/lib/index.js', publicModule: { exports: { Inner: forward } } },
    };
    const story = fiber(11, forward, { a: 1 }, fiber(14, memoed, { b: 'x' }));

    const [first, second] = readDrawnProps(story, modules);

    expect(first).toMatchObject({ component: 'Inner', library: true, props: { a: 1 } });
    expect(second).toMatchObject({ component: 'Label', props: { b: 'x' } });
  });

  it('reads the current tree when the kept fiber is the stale alternate', () => {
    const stale: any = fiber(0, Button, { size: 'old' });
    const current: any = fiber(0, Button, { size: 'new' });
    stale.alternate = current;
    current.alternate = stale;
    const root: any = { tag: 3, stateNode: { current: null }, child: current };
    root.stateNode.current = root;
    stale.return = root;
    current.return = root;

    expect(readDrawnProps(stale)[0].props).toEqual({ size: 'new' });
  });
});
