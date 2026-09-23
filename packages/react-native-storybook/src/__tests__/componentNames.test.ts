/**
 * COMPONENT NAMES - the names of the app's components that render each native view.
 *
 * A capture carries, beside every primitive in the view tree, the name of the app component that
 * renders it - and only when the bundle kept that name. A stripped bundle drops the name, so the
 * name is absent rather than invented.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  componentNamesByNativeTag,
  rememberStoryOfTheApp,
  type RenderedFiber,
} from '../componentNames';

afterEach(() => rememberStoryOfTheApp(undefined));

describe("each native view carries the names of the app's components that render it", () => {
  it('carries the component name beside each primitive', () => {
    // The typography story of the capture poses: TypographyScales draws the scroll view, and every
    // line inside it is drawn by SectionTitle or SampleLine. Storybook renders the story through a
    // wrapper of its own, which is anonymous and so names nothing.
    rememberStoryOfTheApp(
      story(
        anonymousStoryWrapper(
          appComponent(
            'TypographyScales',
            view(
              'ScrollView',
              SCROLL_VIEW,
              appComponent('SectionTitle', view('Text', FONT_SIZES)),
              appComponent('SampleLine', view('Text', FIRST_SAMPLE))
            )
          )
        )
      )
    );

    const names = componentNamesByNativeTag();

    expect(names.get(SCROLL_VIEW)).toEqual(['TypographyScales']);
    // The lines are named by the component that draws each one, and not by TypographyScales: a
    // native view is what stands between them, so what is above it is not repeated below.
    expect(names.get(FONT_SIZES)).toEqual(['SectionTitle']);
    expect(names.get(FIRST_SAMPLE)).toEqual(['SampleLine']);
  });

  it('carries every component above a view, outermost first', () => {
    // The reading the task asks for: MyAppContainer > HeaderText > Text. Neither of the two draws
    // a native view of its own, so both are named on the one view they end up drawing.
    rememberStoryOfTheApp(
      story(appComponent('MyAppContainer', appComponent('HeaderText', view('Text', TITLE))))
    );

    expect(componentNamesByNativeTag().get(TITLE)).toEqual(['MyAppContainer', 'HeaderText']);
  });

  it('names nothing once the story is gone', () => {
    rememberStoryOfTheApp(story(appComponent('Spinner', view('View', SPINNER))));
    expect(componentNamesByNativeTag().get(SPINNER)).toEqual(['Spinner']);

    // A story that unmounts takes its names with it: the next story is read against its own tree,
    // never against the one that was on screen before it.
    rememberStoryOfTheApp(undefined);
    expect(componentNamesByNativeTag().size).toBe(0);
  });
});

describe('a name is carried only when the bundle kept it', () => {
  it('carries no name when the bundle dropped it', () => {
    // A bundle that was minified renames the app's components, and an anonymous one has no name to
    // begin with. Both are the same thing to a reading: no name, so the view carries none rather
    // than a name invented for it.
    rememberStoryOfTheApp(
      story(
        anonymousStoryWrapper(
          appComponent(
            'TypographyScales',
            view('ScrollView', SCROLL_VIEW, unnamedComponent(view('Text', LINE)))
          )
        )
      )
    );

    const names = componentNamesByNativeTag();

    expect(names.get(LINE)).toEqual([]);
    // What the bundle did keep is still carried in the same reading.
    expect(names.get(SCROLL_VIEW)).toEqual(['TypographyScales']);
  });

  it('carries the name its author gave it', () => {
    // An anonymous function that was given a name is no longer unnamed: `displayName` is the name
    // its author wrote, and a bundle has no reason to strip it.
    rememberStoryOfTheApp(
      story(appComponent('Header', givenName('HeaderText', view('Text', TITLE))))
    );

    expect(componentNamesByNativeTag().get(TITLE)).toEqual(['Header', 'HeaderText']);
  });
});

/* ========================================================================== */

const SCROLL_VIEW = 1;
const FONT_SIZES = 2;
const FIRST_SAMPLE = 3;
const TITLE = 4;
const LINE = 5;
const SPINNER = 6;

/** The component the app's story is rendered through, which is where a reading begins. */
function story(storybookRenders: RenderedFiber): RenderedFiber {
  return { type: appComponent('StoryOfTheApp'), child: storybookRenders };
}

/** Storybook's own wrapper around a story: an anonymous function, so it names nothing. */
function anonymousStoryWrapper(child: RenderedFiber): RenderedFiber {
  return unnamedComponent(child);
}

/** A native view, tagged the way React tags it and the inspector reports it. */
function view(primitive: string, nativeTag: number, ...children: RenderedFiber[]): RenderedFiber {
  return { type: primitive, stateNode: { _nativeTag: nativeTag }, child: siblings(children) };
}

/** A component of the app, named the way a bundle that kept the name carries it. */
function appComponent(name: string, ...children: RenderedFiber[]): RenderedFiber {
  const render = (): null => null;
  Object.defineProperty(render, 'name', { value: name });
  return { type: render, child: siblings(children) };
}

/** A component whose function carries no name at all: anonymous, or minified away to nothing. */
function unnamedComponent(...children: RenderedFiber[]): RenderedFiber {
  const render = (): null => null;
  Object.defineProperty(render, 'name', { value: '' });
  return { type: render, child: siblings(children) };
}

/** A component that was anonymous until its author named it. */
function givenName(displayName: string, ...children: RenderedFiber[]): RenderedFiber {
  const render = (): null => null;
  Object.defineProperty(render, 'displayName', { value: displayName });
  return { type: render, child: siblings(children) };
}

/** The children of one fiber, as React links them: each one's sibling is the next. */
function siblings(children: RenderedFiber[]): RenderedFiber | null {
  children.forEach((child, index) => {
    child.sibling = children[index + 1] ?? null;
  });
  return children[0] ?? null;
}
