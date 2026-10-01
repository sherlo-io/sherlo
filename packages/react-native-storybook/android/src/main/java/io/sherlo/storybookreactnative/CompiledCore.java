package io.sherlo.storybookreactnative;

import android.graphics.Bitmap;
import android.util.Log;

/**
 * The C core: the pixel compare and the stillness decision, compiled and stripped into
 * jniLibs/&lt;abi&gt;/libsherlocore.so from packages/sherlo-core/native. These are its JNI entry
 * points (sherlo_core_jni.c); what each does is said in its one header, sherlo_core.h.
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
}
