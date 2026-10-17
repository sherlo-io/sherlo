/**
 * The folds for a native build a push was handed: where it sat, and what it was called.
 */
import { ESCAPE, ESCAPE_AWARE_BOUNDARY } from './maskPatterns';

/** The Android build a push was handed: where it sat, and what it was called. */
export function foldAndroidBuild(screen: string): string {
  return foldNativeBuild(screen, ['.apk'], {
    path: '<SHERLO_ANDROID_BUILD_PATH>',
    fileName: '<SHERLO_ANDROID_BUILD_FILE_NAME>',
  });
}

/**
 * The iOS build a push was handed, the same way (../../constants, `IOS_FILE_TYPES`).
 *
 * XCODE IS LEFT AS IT IS: `/Applications/Xcode.app` ends in `.app` too, but it is the machine's
 * build tool, named in the words that say how to install it, never a build a push was handed.
 */
export function foldIosBuild(screen: string): string {
  return screen
    .split(XCODE_APP_PATH)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : foldNativeBuild(part, ['.tar.gz', '.tar', '.app'], {
            path: '<SHERLO_IOS_BUILD_PATH>',
            fileName: '<SHERLO_IOS_BUILD_FILE_NAME>',
          })
    )
    .join('');
}

/** Xcode where it is installed, captured so a split keeps it: `/Applications/Xcode.app`, `/Applications/Xcode-beta.app`. */
const XCODE_APP_PATH = /(\/Applications\/Xcode[^\s"'`/]*\.app)/;

/** Anything a path may be made of: not whitespace, not a quote, not an escape sequence. */
const PATH_CHARACTER = `[^\\s"'\`${ESCAPE}]`;

/** Anything a bare file NAME may be made of: a path character, and never the separator itself. */
const NAME_CHARACTER = `[^\\s"'\`/${ESCAPE}]`;

/**
 * A native build named on a command line or on a screen.
 *
 * THE PATH GOES FIRST AND THE BARE NAME SECOND, because a path ENDS in the name: folding the name
 * first would leave a directory with a placeholder stuck on the end of it. The longer extensions
 * are tried before the shorter ones for the same reason (`.tar.gz` before `.tar`).
 */
function foldNativeBuild(
  screen: string,
  extensions: string[],
  placeholder: { path: string; fileName: string }
): string {
  let folded = screen;

  for (const extension of extensions) {
    const named = `${escapeForPattern(extension)}${ESCAPE_AWARE_BOUNDARY.after}`;

    folded = folded
      .replace(new RegExp(`${PATH_CHARACTER}*/${PATH_CHARACTER}*${named}`, 'g'), placeholder.path)
      .replace(new RegExp(`${NAME_CHARACTER}+${named}`, 'g'), placeholder.fileName);
  }

  return folded;
}

/** An extension is a literal, and `.` means something else to a pattern. */
function escapeForPattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
