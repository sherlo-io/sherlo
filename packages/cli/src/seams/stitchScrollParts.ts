/**
 * THE JOIN OF A SCROLL'S PARTS into one tall picture, as the cloud runner does it
 * (sherlo-runner src/stitching/image/imageStitcher.ts), so the picture on the Mac and the cloud's
 * match. Three moves:
 *
 * 1. Of two parts that did not move the view, the earlier is dropped and the later kept.
 * 2. Each pair of neighbours is cut in the middle of their overlap, so a header pinned to the top
 *    or a footer pinned to the bottom of the scrolling area is not copied twice.
 * 3. The rows above the scrolling area come from the first part and the rows below it from the
 *    last. With no area known, the whole screen is the area.
 *
 * Parts of slightly different heights are joined at the shortest height.
 */
import { PNG } from 'pngjs';

/** Where the scrolling area sits on screen, in pixels. */
export type ScrollArea = { x: number; y: number; width: number; height: number };

/** One shot taken while the scene was moved: the picture, how far the view had moved, and the order of the shots. */
export type ScrollPart = { png: Buffer; offset: number; index: number };

type PartCut = { top: number; bottom: number };

/** Parts sorted by the order they were shot in, with offsets that strictly grow: a later shot of the same place wins. */
export function dedupeScrollParts<Part extends { offset: number; index: number }>(
  parts: Part[]
): Part[] {
  const kept: Part[] = [];
  for (const part of [...parts].sort((a, b) => a.index - b.index)) {
    while (kept.length > 0 && kept[kept.length - 1].offset >= part.offset) kept.pop();
    kept.push(part);
  }
  return kept;
}

/** The rows of each part to keep, counted inside an area `height` tall: neighbours are cut in the middle of what they share. */
function cutsOf(offsets: number[], height: number): PartCut[] {
  const cuts = offsets.map(() => ({ top: 0, bottom: height }));
  for (let i = 0; i < offsets.length - 1; i++) {
    const overlap = height - (offsets[i + 1] - offsets[i]);
    if (overlap <= 0) continue;
    const halfOverlap = Math.floor(overlap / 2);
    cuts[i].bottom = height - halfOverlap;
    cuts[i + 1].top = overlap - halfOverlap;
  }
  return cuts;
}

/** The picture the parts make together; the part itself when it is the only one. */
export function stitchScrollParts(parts: ScrollPart[], area?: ScrollArea): Buffer {
  const kept = dedupeScrollParts(parts);
  if (kept.length === 0) throw new Error('No parts to stitch');

  const pngs = kept.map(({ png }) => PNG.sync.read(png));
  const { width } = pngs[0];
  const screenHeight = Math.min(...pngs.map((png) => png.height));
  if (kept.length === 1) return kept[0].png;

  const bandTop = area?.y ?? 0;
  const bandHeight = area?.height ?? screenHeight;
  const staticBottom = Math.max(0, screenHeight - (bandTop + bandHeight));
  const bandCuts = cutsOf(
    kept.map(({ offset }) => offset),
    bandHeight
  );

  const last = kept.length - 1;
  const cuts = bandCuts.map((cut, i) => ({
    top: i === 0 ? 0 : bandTop + cut.top,
    bottom: i === last ? screenHeight : bandTop + cut.bottom,
  }));
  // The last part also carries what sits below the area, which the band cut does not count.
  const copied = cuts.map((cut, i) =>
    Math.max(
      0,
      i === last ? bandCuts[i].bottom - bandCuts[i].top + staticBottom : cut.bottom - cut.top
    )
  );

  const totalHeight = copied.reduce((sum, height) => sum + height, 0);
  const joined = new PNG({ width, height: totalHeight });
  let destY = 0;
  pngs.forEach((png, i) => {
    const rows = Math.min(copied[i], png.height - cuts[i].top, totalHeight - destY);
    if (rows <= 0) return;
    PNG.bitblt(png, joined, 0, cuts[i].top, width, rows, 0, destY);
    destY += rows;
  });
  return PNG.sync.write(joined);
}
