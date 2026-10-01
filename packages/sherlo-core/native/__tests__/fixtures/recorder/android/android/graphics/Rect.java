package android.graphics;

/** The recorder's Rect, as Android's: four ints, its width and height their differences. */
public class Rect {
    public int left;
    public int top;
    public int right;
    public int bottom;

    public Rect() {
    }

    public Rect(int left, int top, int right, int bottom) {
        this.left = left;
        this.top = top;
        this.right = right;
        this.bottom = bottom;
    }

    public void set(Rect other) {
        left = other.left;
        top = other.top;
        right = other.right;
        bottom = other.bottom;
    }

    public final int width() {
        return right - left;
    }

    public final int height() {
        return bottom - top;
    }
}
