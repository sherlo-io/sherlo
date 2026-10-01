package android.view;

import android.content.res.Resources;
import android.graphics.Rect;

/**
 * The recorder's View: what the original InspectorHelper.java and the transcribed scroll engine
 * read from one. Every answer is a field the recorder scripts.
 */
public class View {
    public static final int VISIBLE = 0;

    // What the inspector reads.
    public Resources resources;
    public boolean globallyVisible;
    public Rect globalVisibleRect = new Rect();
    public int screenX;
    public int screenY;
    public int width;
    public int height;
    public int id;
    public Rect windowVisibleDisplayFrame = new Rect();

    // What the scroll engine reads.
    public boolean canScrollDown;
    public boolean canScrollUp;
    public int visibility = VISIBLE;
    public int scrollRange;
    public int scrollExtent;
    public int scrollOffset;
    public int scrollY;
    /** How the view scrolls: its scrollY and offset together (a ScrollView), or its offset alone (a RecyclerView). */
    public boolean scrollsOffsetAlone;
    public int lowestReachableOffset;
    public int highestReachableOffset;
    /** Every scrollBy the glue made, and where the view went: "<dy>><scrollY>,<offset>". */
    public java.util.List<String> scrollsMade = new java.util.ArrayList<>();

    public View getRootView() {
        return this;
    }

    public Resources getResources() {
        return resources;
    }

    public void getWindowVisibleDisplayFrame(Rect outRect) {
        outRect.set(windowVisibleDisplayFrame);
    }

    public boolean getGlobalVisibleRect(Rect outRect) {
        outRect.set(globalVisibleRect);
        return globallyVisible;
    }

    public void getLocationOnScreen(int[] outLocation) {
        outLocation[0] = screenX;
        outLocation[1] = screenY;
    }

    public int getWidth() {
        return width;
    }

    public int getHeight() {
        return height;
    }

    public int getId() {
        return id;
    }

    public boolean canScrollVertically(int direction) {
        return direction > 0 ? canScrollDown : canScrollUp;
    }

    public int getVisibility() {
        return visibility;
    }

    public int getScrollY() {
        return scrollY;
    }

    protected int computeVerticalScrollRange() {
        return scrollRange;
    }

    protected int computeVerticalScrollExtent() {
        return scrollExtent;
    }

    protected int computeVerticalScrollOffset() {
        return scrollOffset;
    }

    public void scrollBy(int x, int y) {
        int target = Math.max(lowestReachableOffset, Math.min(highestReachableOffset, scrollOffset + y));
        int moved = target - scrollOffset;
        scrollOffset = target;
        if (!scrollsOffsetAlone) scrollY += moved;
        scrollsMade.add(y + ">" + scrollY + "," + scrollOffset);
    }
}
