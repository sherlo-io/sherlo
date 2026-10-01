package android.view;

import java.util.ArrayList;
import java.util.List;

/** The recorder's ViewGroup: a View with children. */
public class ViewGroup extends View {
    public final List<View> children = new ArrayList<>();

    public int getChildCount() {
        return children.size();
    }

    public View getChildAt(int index) {
        return children.get(index);
    }
}
