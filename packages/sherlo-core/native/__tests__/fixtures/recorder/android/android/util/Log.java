package android.util;

/** The recorder's Log: it says nothing. */
public final class Log {
    public static int d(String tag, String message) {
        return 0;
    }

    public static int e(String tag, String message, Throwable error) {
        return 0;
    }
}
