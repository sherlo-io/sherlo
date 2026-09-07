/**
 * PRINT A LITERAL PIN for renderLayerLiterals.test.ts - the bytes a segment renders at
 * chalk level 1, spelled the way PINS spells them (`${ESC}` for the escape byte), ready to
 * paste into a `prints:` block.
 *
 *   npx tsx src/render/__tests__/printPin.ts '{"kind":"team-created","team":{"name":"Design Guild","id":"team_9f3a2c"}}'
 *
 * WHY THIS EXISTS (2026-09-07). The pin is the one part of a new transcript family that
 * took thought rather than typing: every colour code hand-spelled, one `[22m` where a
 * `[39m` belonged and the pin is a lie about the product. The test's own refusal already
 * says "run the segment through renderSegment with chalk.level = 1 and copy what comes
 * out" - this is that sentence as a command. It prints; it never writes the test file,
 * because reading the bytes before pinning them is the point of a pin.
 */
import chalk from 'chalk';

// Colour is pinned BEFORE any render module loads: several bake chalk strings at import
// time (see ../dryRunPlan's header), so the import has to be dynamic and come second.
chalk.level = 1;

const source = process.argv[2];
if (!source) {
  console.error('usage: npx tsx src/render/__tests__/printPin.ts \'<segment json>\'');
  process.exit(2);
}

const spell = (value: unknown): string =>
  '`' + String(value).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${').replace(/\x1b/g, '${ESC}') + '`';

// The package is CommonJS, so no top-level await: the render module is loaded inside main.
void (async () => {
  const { renderSegment } = await import('../renderSegment');
  const segment = JSON.parse(source);
  const { stream, prints } = renderSegment(segment);
  console.log(`    stream: '${stream}',`);
  console.log('    prints: [');
  for (const call of prints) console.log(`      [${call.map(spell).join(', ')}],`);
  console.log('    ],');
})();
