import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { stitchScrollParts } from '../stitchScrollParts';

const WIDTH = 4;

/** A picture whose every row is its own colour, so a repeated or missing row shows. */
function pictureOfRows(rows: number[]): Buffer {
  const png = new PNG({ width: WIDTH, height: rows.length });
  rows.forEach((row, y) => {
    for (let x = 0; x < WIDTH; x++) {
      const at = (y * WIDTH + x) * 4;
      png.data[at] = row % 256;
      png.data[at + 1] = Math.floor(row / 256);
      png.data[at + 2] = 7;
      png.data[at + 3] = 255;
    }
  });
  return PNG.sync.write(png);
}

/** The row numbers of a picture, read back from its colours. */
function rowsOf(picture: Buffer): number[] {
  const png = PNG.sync.read(picture);
  const at = (y: number) => y * WIDTH * 4;
  return Array.from({ length: png.height }, (_, y) => png.data[at(y)] + 256 * png.data[at(y) + 1]);
}

const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);

/** The screen of a page 300 rows tall, seen after the view moved `offset` rows. */
const screenAt = (offset: number) => pictureOfRows(range(offset, offset + 100));

describe('scroll parts are stitched into one picture', () => {
  it("overlapping parts are joined without repeated rows, as the runner's dedupe does", () => {
    const joined = stitchScrollParts([
      { png: screenAt(0), offset: 0, index: 0 },
      { png: screenAt(50), offset: 50, index: 1 },
      // The same place shot twice: the later shot wins and no band is copied twice.
      { png: screenAt(100), offset: 100, index: 2 },
      { png: screenAt(100), offset: 100, index: 3 },
      { png: screenAt(150), offset: 150, index: 4 },
      { png: screenAt(200), offset: 200, index: 5 },
    ]);

    expect(rowsOf(joined)).toEqual(range(0, 300));
  });

  it('a scrolling area keeps the rows above it from the first part and below it from the last', () => {
    // Rows 1000+ are a pinned header, 2000+ a pinned footer, and the area between them scrolls.
    const screen = (offset: number) =>
      pictureOfRows([
        ...range(1000, 1020),
        ...range(20 + offset, 80 + offset),
        ...range(2000, 2020),
      ]);

    const joined = stitchScrollParts(
      [
        { png: screen(0), offset: 0, index: 0 },
        { png: screen(30), offset: 30, index: 1 },
        { png: screen(60), offset: 60, index: 2 },
      ],
      { x: 0, y: 20, width: WIDTH, height: 60 }
    );

    expect(rowsOf(joined)).toEqual([...range(1000, 1020), ...range(20, 140), ...range(2000, 2020)]);
  });

  it('one part is the picture as it was shot', () => {
    const only = screenAt(0);

    expect(stitchScrollParts([{ png: only, offset: 0, index: 0 }])).toBe(only);
  });
});
