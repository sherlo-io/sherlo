import { type BoxType, renderBox } from '../render/box';

/** A box drawn by ../render/box at the width of the terminal this process prints to. */
function wrapInBox({
  text,
  title,
  type,
  indent,
}: {
  text: string;
  title?: string;
  type?: BoxType;
  indent?: number;
}): string {
  return renderBox({ text, title, type, indent, terminalColumns: process.stdout.columns });
}

export default wrapInBox;
