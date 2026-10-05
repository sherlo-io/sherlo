package io.sherlo.storybookreactnative;

import android.graphics.Bitmap;
import android.util.Log;

/**
 * The C core: the pixel compare, the stillness decision, the scroll engine and the inspector's
 * JSON, compiled and stripped into jniLibs/&lt;abi&gt;/libsherlocore.so from
 * packages/sherlo-core/native. These are its JNI entry points (sherlo_core_jni.c); what each does
 * is said in its one header, sherlo_core.h.
 *
 * The library loads once. A library that does not load, or that speaks a C ABI this glue does not
 * know, is never called: unusableReason() says why.
 */
final class CompiledCore {
    private static final String TAG = "SherloModule:CompiledCore";

    /** The C core's ABI this glue knows (SHERLO_CORE_ABI when it was written). */
    private static final int KNOWN_ABI = 1;

    static final int STILL_CONTINUE = 0;
    static final int STILL_STABLE = 1;
    static final int STILL_UNSTABLE = 2;
    static final long ERROR_BAD_ARGUMENT = -1;
    static final long ERROR_SIZE_MISMATCH = -2;

    private static final String UNUSABLE_REASON = loadAndCheckAbi();

    private CompiledCore() {
    }

    /** Why the C core cannot be used, or null when it can. */
    static String unusableReason() {
        return UNUSABLE_REASON;
    }

    /** The C core's own version, or null when it cannot be used. */
    static String version() {
        return UNUSABLE_REASON == null ? nativeVersion() : null;
    }

    private static String loadAndCheckAbi() {
        try {
            System.loadLibrary("sherlocore");
            int abi = nativeAbi();
            if (abi != KNOWN_ABI) {
                return "the C core speaks ABI " + abi + ", this SDK knows ABI " + KNOWN_ABI;
            }
            Log.d(TAG, "C core " + nativeVersion() + " loaded");
            return null;
        } catch (Throwable error) {
            return "libsherlocore.so did not load: " + error.getMessage();
        }
    }

    /**
     * One stillness decision under way. It is ended once: end() frees the core's state, and a
     * second call does nothing.
     */
    static final class StillnessDecision {
        private long handle;

        private StillnessDecision(long handle) {
            this.handle = handle;
        }

        /** Starts a decision, or returns null when the core refused to start one. */
        static StillnessDecision begin(int requiredStillPairs, int minimumScreenshots,
                boolean countsFirstScreenshot, long timeLimitMs, double threshold, boolean includeAA, long nowMs) {
            long handle = nativeStillBegin(requiredStillPairs, minimumScreenshots, countsFirstScreenshot,
                    timeLimitMs, threshold, includeAA, nowMs);
            return handle == 0 ? null : new StillnessDecision(handle);
        }

        /** One step (see nativeStillStep); after end() it answers the core's bad-argument error. */
        synchronized int step(Bitmap previous, Bitmap current, long nowMs, boolean focusWasCleared,
                long[] differentPixels) {
            if (handle == 0) {
                differentPixels[0] = ERROR_BAD_ARGUMENT;
                return (int) ERROR_BAD_ARGUMENT;
            }
            return nativeStillStep(handle, previous, current, nowMs, focusWasCleared, differentPixels);
        }

        synchronized void end() {
            if (handle == 0) return;
            nativeStillEnd(handle);
            handle = 0;
        }
    }

    private static native int nativeAbi();

    private static native String nativeVersion();

    /** sherlo_still_begin: the decision's handle, or 0 when the core refused to start one. */
    private static native long nativeStillBegin(int requiredStillPairs, int minimumScreenshots,
            boolean countsFirstScreenshot, long timeLimitMs, double threshold, boolean includeAA, long nowMs);

    /**
     * sherlo_still_step on two ARGB_8888 Bitmaps, read in place. Writes the number of differing
     * pixels (or an error) to differentPixels[0].
     */
    private static native int nativeStillStep(long stillness, Bitmap previous, Bitmap current, long nowMs,
            boolean focusWasCleared, long[] differentPixels);

    private static native void nativeStillEnd(long stillness);

    // ---- The scroll engine ----------------------------------------------------------------------

    /**
     * sherlo_scroll_candidate_is_eligible, for a view the walk reached that can scroll
     * vertically: is it VISIBLE, and not one of the framework's own (by its getClass().getName())?
     * Only an eligible view has its other numbers read.
     */
    static native boolean nativeScrollCandidateIsEligible(String className, boolean isShown);

    /**
     * sherlo_scroll_candidate_fits, for an eligible view read in full: its height, its
     * computeVerticalScrollRange (-1 when unread), whether getGlobalVisibleRect found it and that
     * rect's size, against the root view's size. The walk stops at the first that fits.
     */
    static native boolean nativeScrollCandidateFits(String className, boolean isShown, int height, int range,
            boolean isOnScreen, int visibleWidth, int visibleHeight, int screenWidth, int screenHeight);

    /** sherlo_scroll_is_scrollable, for a view's height and computeVerticalScrollRange. */
    static native boolean nativeScrollIsScrollable(boolean canScroll, boolean isShown, int height, int range);

    /**
     * sherlo_scroll_nudge_target: whether the nudge has an attempt numbered `attempt`, and the
     * distance to scroll by for it, in distance[0]. offset and scrollY are where the view was
     * before the nudge.
     */
    static native boolean nativeScrollNudgeTarget(int attempt, int offset, int scrollY, int[] distance);

    /** sherlo_scroll_nudge_moved: whether the view moved from one offset and scrollY to the other. */
    static native boolean nativeScrollNudgeMoved(int offsetBefore, int scrollYBefore, int offsetAfter,
            int scrollYAfter);

    /** sherlo_checkpoint_plan_for: the computeVerticalScrollOffset the checkpoint scrolls to. */
    static native int nativeCheckpointTarget(int index, int stepPx, int lastIndex, int height, int range,
            int extent);

    /**
     * sherlo_checkpoint_read_back, once the view is scrolled to actualOffset: writes reachedBottom
     * (1 or 0), appliedIndex, appliedOffsetPx, viewportPx and contentPx to result. The numbers
     * before actualOffset are the ones nativeCheckpointTarget was given.
     */
    static native void nativeCheckpointReadBack(int index, int stepPx, int lastIndex, int height,
            int range, int extent, int actualOffset, int[] result);

    // ---- The inspector --------------------------------------------------------------------------

    /** How many numbers nativeInspectorJson reads for each node. */
    static final int NUMBERS_PER_INSPECTOR_NODE = 11;

    /** sherlo_inspector_has_room: whether the tree has room for a node at depth. */
    static native boolean nativeInspectorHasRoom(int depth, int nodesKept);

    /** sherlo_inspector_is_on_screen: whether a view from top to bottom meets the viewport. */
    static native boolean nativeInspectorIsOnScreen(int top, int bottom, int viewportTop,
            int viewportBottom);

    /**
     * sherlo_inspector_json: the JSON getInspectorData answers, or null when the core refused. For
     * each of the nodeCount nodes, in pre-order, NUMBERS_PER_INSPECTOR_NODE numbers: depth, class
     * index, isVisible (1 or 0), x, y, width, height, has an id (1 or 0), id, top, bottom.
     */
    static native String nativeInspectorJson(int[] nodeNumbers, int nodeCount, String[] classNames,
            float density, float fontScale, int viewportTop, int viewportBottom);
}
