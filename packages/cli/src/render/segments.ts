/**
 * THE TRANSCRIPT SEGMENT UNION - what the CLI emits, before anyone decides where
 * it goes (SHERLO CLI render layer, slice S0a: the `--dry-run` family).
 *
 * A CLI transcript is not one string. The CLI prints PROGRESSIVELY - a developer
 * watches `🤖 Building android bundle...` while the bundler runs, and only then
 * sees the size line. So the render layer is per-SEGMENT, not per-transcript:
 *
 *     logic  --emit(segment)-->  renderSegment  -->  sink  -->  stdout | buffer
 *
 * The real CLI's sink writes each segment as it arrives, so nothing about the
 * user's experience changes. An expectation producer's sink appends to an array.
 * Byte-identity holds because a transcript is exactly the concatenation of its
 * segments, in order.
 *
 * A SEGMENT CARRIES DATA, NEVER TEXT. Every literal, every emoji, every chalk
 * call and every blank line lives in ./renderSegment - which is why a producer
 * cannot render a sentence the CLI would not have printed: the only thing it can
 * supply is the state, and the same renderer turns that state into bytes for the
 * real run and for the expectation.
 *
 * BLANK LINES ARE CONTENT. Several of these segments begin or end with a blank
 * line, and a committed fixture compares byte-for-byte - so a `.filter(Boolean)`
 * anywhere downstream of a renderer is a product bug, not a tidy-up.
 */
import { Platform } from '@sherlo/api-types';
import type { BundleFormat } from '../commands/test/buildBundle';
import type { DryRunPlatformPreview } from './dryRunPlan';

/** Which of the process's two streams a segment is written to. */
export type TranscriptStream = 'stdout' | 'stderr';

/**
 * One printable block of a sherlo CLI transcript.
 *
 * Scoped, deliberately, to what the `--dry-run` family emits (slice S0a). The
 * next family (the push transcript) adds variants here; it does not add a second
 * union, and it does not add a second renderer.
 */
export type TranscriptSegment =
  /** The gradient wordmark, the tagline and the trailing blank line. */
  | { kind: 'intro' }
  /** `📦 Bundling for dry-run preview...`, wrapped in its own blank lines. */
  | { kind: 'dry-run-bundling-header' }
  /** `🤖 Building android bundle...` - printed BEFORE the bundler runs. */
  | { kind: 'platform-bundle-start'; platform: Platform }
  /** `  ✓ Bundle: bundle.android.js (4.29 MB, plain-js, expo)`. */
  | {
      kind: 'platform-bundle-built';
      bundlePath: string;
      bundleSizeMb: number;
      bundleFormat: BundleFormat;
      bundler: 'expo' | 'rn';
    }
  /** `  ✓ Assets: 6 files` - emitted only when the bundler produced an assets dir. */
  | { kind: 'platform-bundle-assets'; assetCount: number }
  /** `  ✗ <message>` - a bundling failure, already carrying its own fallback line. */
  | { kind: 'platform-bundle-failed'; message: string }
  /** The whole `📸 Capture plan (dry run)` block plus the `◦ Dry run` closer. */
  | { kind: 'dry-run-capture-plan'; previews: DryRunPlatformPreview[] }
  /** `Couldn't get git info <error>` - on stderr, the one degrade the family shows. */
  | { kind: 'git-info-unavailable'; error: unknown };

/**
 * Where rendered segments go. The CLI installs a sink that writes to the
 * process's streams; a producer installs one that buffers.
 */
export type TranscriptSink = (segment: TranscriptSegment) => void;
