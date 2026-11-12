import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { shootScrollParts, shootWholeScroll } from '../scrollParts';
import type { ScrollApp } from '../scrollParts';

const WIDTH = 2;
const SCREEN = 100;

/** A picture of `SCREEN` rows whose first row is `firstRow`, so the place it shows can be told. */
function screenFrom(firstRow: number): Buffer {
  const png = new PNG({ width: WIDTH, height: SCREEN });
  for (let y = 0; y < SCREEN; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const at = (y * WIDTH + x) * 4;
      const row = firstRow + y;
      png.data[at] = row % 256;
      png.data[at + 1] = Math.floor(row / 256);
      png.data[at + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

/** A scene `pageHeight` rows tall on a screen of `SCREEN` rows: the app, the asks it heard, and the screen it shows. */
function scene(pageHeight: number | undefined, drift = 0) {
  let position = 0;
  const asked: { index: number; offset: number; maxIndex: number }[] = [];
  const shots: number[] = [];
  const app: ScrollApp = {
    isScrollable: async () => ({ scrollable: pageHeight !== undefined }),
    scrollTo: async (index, offset, maxIndex) => {
      asked.push({ index, offset, maxIndex });
      const bottom = (pageHeight ?? SCREEN) - SCREEN;
      position = Math.min(index * offset, bottom);
      return { reachedBottom: position === bottom, appliedOffsetPx: position };
    },
  };
  return {
    app,
    asked,
    shots,
    // Each shot after the first take is `drift` rows off, as a pager that settled elsewhere is.
    shoot: async () => {
      shots.push(position);
      return screenFrom(position + (shots.length > 5 ? drift : 0));
    },
  };
}

describe('a scrolling scene is shot in parts', () => {
  it('a scrollable scene is shot in steps of half a screen until the end of its scroll', async () => {
    const page = scene(300);

    const take = await shootScrollParts({ app: page.app, shoot: page.shoot, settleMs: 0 });

    // Half a screen is 50 rows: the view is moved to 50, 100, 150 and 200, where the page ends.
    expect(page.asked.map(({ index, offset }) => [index, offset])).toEqual([
      [1, 50],
      [2, 50],
      [3, 50],
      [4, 50],
    ]);
    expect(take.kind === 'parts' && take.parts.map(({ offset }) => offset)).toEqual([
      0, 50, 100, 150, 200,
    ]);
  });

  it('a scene that does not scroll is shot once', async () => {
    const page = scene(undefined);

    const take = await shootScrollParts({ app: page.app, shoot: page.shoot, settleMs: 0 });

    expect(page.shots).toEqual([0]);
    expect(page.asked).toEqual([]);
    expect(take.kind).toBe('one-screen');
  });

  it('a scroll that never moves the view ends after three parts that did not advance it', async () => {
    const page = scene(300);
    page.app.scrollTo = async (index, offset, maxIndex) => {
      page.asked.push({ index, offset, maxIndex });
      return { reachedBottom: false, appliedOffsetPx: 0 };
    };

    await shootScrollParts({ app: page.app, shoot: page.shoot, settleMs: 0 });

    expect(page.asked).toHaveLength(3);
  });
});

describe('a scene is shot whole only when two takes agree', () => {
  it('two takes that join to the same picture give the whole scroll', async () => {
    const page = scene(300);

    const whole = await shootWholeScroll({ app: page.app, shoot: page.shoot, settleMs: 0 });

    expect(PNG.sync.read(whole.picture).height).toBe(300);
    expect(whole.firstScreenOnly).toBeUndefined();
  });

  it('takes that join to different pictures give the first screen only, and say so', async () => {
    const page = scene(300, 7);

    const whole = await shootWholeScroll({ app: page.app, shoot: page.shoot, settleMs: 0 });

    expect(PNG.sync.read(whole.picture).height).toBe(SCREEN);
    expect(whole.firstScreenOnly).toBe('takes-differ');
  });

  it('a scene that does not scroll gives its one screen', async () => {
    const page = scene(undefined);

    const whole = await shootWholeScroll({ app: page.app, shoot: page.shoot, settleMs: 0 });

    expect(PNG.sync.read(whole.picture).height).toBe(SCREEN);
    expect(whole.firstScreenOnly).toBeUndefined();
  });
});
