import chalk from 'chalk';

/**
 * The dim "... and 3 more" line that ends a list cut short, for a story's suggestions, a scene's
 * logged errors and every other list the screens print a handful of; no line when nothing was left out.
 */
export function moreLines(more: number): string[] {
  return more > 0 ? [chalk.dim(`  ... and ${more} more`)] : [];
}
