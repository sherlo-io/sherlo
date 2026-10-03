import android.app.Activity;
import android.content.res.Resources;
import android.graphics.Rect;
import android.view.View;
import android.view.ViewGroup;
import com.android.internal.widget.RecordedInternalScrollView;
import com.facebook.react.bridge.Promise;
import io.sherlo.storybookreactnative.InspectorHelper;

import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

/**
 * The Android half of the parity recorder for the views (Record.java calls it):
 *
 * - The scroll engine of SherloModuleCore.java, transcribed below: findBestScrollViewBFS's test of
 *   each view (its lines 657-681), isFrameworkInternalScrollView (697-704), isScrollableByMetrics
 *   (728-773), the reflection reads (569-580, 778-806), validateWithNudge (811-856) and
 *   performScrollToCheckpoint (480-551), each run on scripted views. scrollViewBy (862-885) ends
 *   in view.scrollBy(0, dy) for every kind of view, and is that here.
 * - The inspector: the original InspectorHelper.java itself, run on a scripted view tree.
 *
 * The views are the stand-ins in android/view, their org.json the stand-in in org/json.
 */
final class RecordViews {
    private static final float EPSILON = 4.0f;
    private static final float NUDGE_PX = 3.0f;

    // ---- The scroll engine, transcribed ----------------------------------------------------------

    static class AppScrollView extends View {
    }

    private static int getScrollExtentViaReflection(View view) {
        try {
            java.lang.reflect.Method method = View.class.getDeclaredMethod("computeVerticalScrollExtent");
            method.setAccessible(true);
            return (Integer) method.invoke(view);
        } catch (Exception e) {
            return -1;
        }
    }

    private static int getScrollRangeViaReflection(View view) {
        try {
            java.lang.reflect.Method method = View.class.getDeclaredMethod("computeVerticalScrollRange");
            method.setAccessible(true);
            return (Integer) method.invoke(view);
        } catch (Exception e) {
            return -1;
        }
    }

    private static int getScrollOffsetViaReflection(View view) {
        try {
            java.lang.reflect.Method method = View.class.getDeclaredMethod("computeVerticalScrollOffset");
            method.setAccessible(true);
            return (Integer) method.invoke(view);
        } catch (Exception e) {
            // Fallback to getScrollY
            return view.getScrollY();
        }
    }

    private static boolean isFrameworkInternalScrollView(View view) {
        String className = view.getClass().getName();
        // Android internal framework classes
        if (className.startsWith("com.android.internal.")) {
            return true;
        }
        return false;
    }

    private static boolean isScrollableByMetrics(View view) {
        // Basic scrollability check using public API
        if (!(view.canScrollVertically(1) || view.canScrollVertically(-1))) {
            return false;
        }

        if (view.getVisibility() != View.VISIBLE) {
            return false;
        }

        // Use view height as extent (viewport height)
        int extent = view.getHeight();

        // Try to get scroll range using reflection since computeVerticalScrollRange is protected
        int range = getScrollRangeViaReflection(view);

        // If reflection failed, estimate based on canScrollVertically
        // A view that can scroll in both directions has significant content
        if (range <= 0) {
            boolean canScrollDown = view.canScrollVertically(1);
            boolean canScrollUp = view.canScrollVertically(-1);

            // If we can scroll in any direction, assume it's scrollable
            return canScrollDown || canScrollUp;
        }

        int scrollRange = range - extent;

        if (extent <= 0) {
            return false;
        }

        if (scrollRange <= EPSILON) {
            return false;
        }

        return true;
    }

    /** findBestScrollViewBFS, for the views its walk met, in that order. */
    private static int pickScrollView(View root, List<View> views) {
        int screenArea = root.getWidth() * root.getHeight();
        int minArea = screenArea / 10; // 10% threshold

        for (int index = 0; index < views.size(); index++) {
            View view = views.get(index);

            if (view.canScrollVertically(1) || view.canScrollVertically(-1)) {
                if (view.getVisibility() == View.VISIBLE && !isFrameworkInternalScrollView(view)) {
                    if (isScrollableByMetrics(view)) {
                        // Check minimum area - skip tiny scrollable views (toasts, badges, etc.)
                        android.graphics.Rect rect = new android.graphics.Rect();
                        if (view.getGlobalVisibleRect(rect)) {
                            int area = rect.width() * rect.height();
                            if (area < minArea) {
                            } else {
                                return index;
                            }
                        }
                    }
                }
            }
        }

        return -1;
    }

    private static void scrollViewBy(View view, int dy) {
        view.scrollBy(0, dy);
    }

    private static boolean validateWithNudge(View view) {
        int originalScrollY = view.getScrollY();
        int originalOffset = getScrollOffsetViaReflection(view);
        int nudgePx = (int) NUDGE_PX;

        // Try scrolling down first
        scrollViewBy(view, nudgePx);

        int newScrollY = view.getScrollY();
        int newOffset = getScrollOffsetViaReflection(view);

        // Restore
        scrollViewBy(view, -(newScrollY - originalScrollY));

        int delta = Math.abs(newOffset - originalOffset);
        int deltaScrollY = Math.abs(newScrollY - originalScrollY);

        // Check both scrollY and computed offset
        boolean moved = delta >= 1 || deltaScrollY >= 1;

        // If we couldn't scroll down, try scrolling up
        if (!moved) {
            scrollViewBy(view, -nudgePx);
            newScrollY = view.getScrollY();
            newOffset = getScrollOffsetViaReflection(view);

            // Restore
            scrollViewBy(view, -(newScrollY - originalScrollY));

            delta = Math.abs(newOffset - originalOffset);
            deltaScrollY = Math.abs(newScrollY - originalScrollY);
            moved = delta >= 1 || deltaScrollY >= 1;
        }

        return moved;
    }

    /** performScrollToCheckpoint from its metrics on: "reachedBottom appliedIndex appliedOffsetPx viewportPx contentPx". */
    private static String performScrollToCheckpoint(View candidate, int index, int offsetPx, int maxIndex) {
        // 2. Compute Metrics
        int viewportPx = candidate.getHeight();

        int range = getScrollRangeViaReflection(candidate);

        int extent = getScrollExtentViaReflection(candidate);
        if (extent <= 0) extent = viewportPx;

        int maxOffsetPx = Math.max(0, range - extent);
        int minOffsetPx = 0;

        // 3. Calculate Target
        int clampedIndex = index;
        if (clampedIndex < 0) clampedIndex = 0;
        if (clampedIndex > maxIndex) clampedIndex = maxIndex;

        int targetPx;
        if (clampedIndex == 0) {
            targetPx = minOffsetPx;
        } else {
            targetPx = minOffsetPx + (clampedIndex * offsetPx);
        }

        int clampedPx = Math.max(minOffsetPx, Math.min(maxOffsetPx, targetPx));

        // 4. Apply Scroll
        int currentOffset = getScrollOffsetViaReflection(candidate);
        int delta = clampedPx - currentOffset;

        if (Math.abs(delta) > 0) {
            scrollViewBy(candidate, delta);
        }

        // 5. Read Back
        int actualOffsetPx = getScrollOffsetViaReflection(candidate);

        // 6. Detect Bottom
        boolean reachedBottom = false;
        if (actualOffsetPx >= maxOffsetPx - EPSILON) {
            reachedBottom = true;
        }
        if (maxOffsetPx <= EPSILON) {
            reachedBottom = true;
        }

        return (reachedBottom ? 1 : 0) + " " + clampedIndex + " " + actualOffsetPx + " " + viewportPx + " " + range;
    }

    // ---- The scroll cases ------------------------------------------------------------------------
    //
    // One case a line, its first word naming it:
    //   pick <root width> <root height> <count>, then for each view the walk met:
    //        <app or internal> <view> <globally visible> <visible width> <visible height>
    //   check <view>
    //   nudge <view> <scrolling>
    //   checkpoint <view> <extent> <scrolling> <index> <offset px> <max index>
    // where <view> is "canScrollDown canScrollUp visibility height range" and <scrolling> is
    // "offsetAlone scrollY offset lowestReachableOffset highestReachableOffset".
    // Each answers one line:
    //   pick: the index picked (-1 for none), then each view's class name.
    //   check: 1 or 0.
    //   nudge: 1 or 0, then each scrollBy made, as "<dy>><scrollY>,<offset>".
    //   checkpoint: each scrollBy made, then "|", then reachedBottom appliedIndex appliedOffsetPx
    //               viewportPx contentPx.

    private static void readView(View view, Iterator<String> words) {
        view.canScrollDown = words.next().equals("1");
        view.canScrollUp = words.next().equals("1");
        view.visibility = Integer.parseInt(words.next());
        view.height = Integer.parseInt(words.next());
        view.scrollRange = Integer.parseInt(words.next());
    }

    private static void readScrolling(View view, Iterator<String> words) {
        view.scrollsOffsetAlone = words.next().equals("1");
        view.scrollY = Integer.parseInt(words.next());
        view.scrollOffset = Integer.parseInt(words.next());
        view.lowestReachableOffset = Integer.parseInt(words.next());
        view.highestReachableOffset = Integer.parseInt(words.next());
    }

    static void recordScrollCases(String file) throws Exception {
        for (String line : Files.readAllLines(Paths.get(file))) {
            if (line.isBlank()) continue;
            Iterator<String> words = java.util.Arrays.asList(line.trim().split(" ")).iterator();
            String kind = words.next();
            List<String> answer = new ArrayList<>();

            if (kind.equals("pick")) {
                View root = new View();
                root.width = Integer.parseInt(words.next());
                root.height = Integer.parseInt(words.next());
                int count = Integer.parseInt(words.next());
                List<View> views = new ArrayList<>();
                for (int index = 0; index < count; index++) {
                    View view = words.next().equals("internal") ? new RecordedInternalScrollView() : new AppScrollView();
                    readView(view, words);
                    view.globallyVisible = words.next().equals("1");
                    view.globalVisibleRect = new Rect(0, 0, Integer.parseInt(words.next()), Integer.parseInt(words.next()));
                    views.add(view);
                }
                answer.add(String.valueOf(pickScrollView(root, views)));
                for (View view : views) answer.add(view.getClass().getName());
            } else if (kind.equals("check")) {
                View view = new AppScrollView();
                readView(view, words);
                answer.add(isScrollableByMetrics(view) ? "1" : "0");
            } else if (kind.equals("nudge")) {
                View view = new AppScrollView();
                readView(view, words);
                readScrolling(view, words);
                answer.add(validateWithNudge(view) ? "1" : "0");
                answer.addAll(view.scrollsMade);
            } else if (kind.equals("checkpoint")) {
                View view = new AppScrollView();
                readView(view, words);
                view.scrollExtent = Integer.parseInt(words.next());
                readScrolling(view, words);
                int index = Integer.parseInt(words.next());
                int offsetPx = Integer.parseInt(words.next());
                int maxIndex = Integer.parseInt(words.next());
                String result = performScrollToCheckpoint(view, index, offsetPx, maxIndex);
                answer.addAll(view.scrollsMade);
                answer.add("|");
                answer.add(result);
            } else {
                throw new IllegalArgumentException("unknown scroll case " + kind);
            }
            System.out.println(String.join(" ", answer));
        }
    }

    // ---- The inspector trees ---------------------------------------------------------------------

    static class DecorView extends ViewGroup {
    }

    static class LinearLayout extends ViewGroup {
    }

    static class FrameLayout extends ViewGroup {
    }

    static class ReactRootView extends ViewGroup {
    }

    static class ReactViewGroup extends ViewGroup {
    }

    static class ReactScrollView extends ViewGroup {
    }

    static class ReactTextView extends View {
    }

    static class ReactImageView extends View {
    }

    static class Ünicode extends ViewGroup {
    }

    static class My$View extends ViewGroup {
    }

    private static View viewOfClass(String key) {
        switch (key) {
            case "DecorView": return new DecorView();
            case "LinearLayout": return new LinearLayout();
            case "FrameLayout": return new FrameLayout();
            case "ReactRootView": return new ReactRootView();
            case "ReactViewGroup": return new ReactViewGroup();
            case "ReactScrollView": return new ReactScrollView();
            case "ReactTextView": return new ReactTextView();
            case "ReactImageView": return new ReactImageView();
            case "Unicode": return new Ünicode();
            case "Dollar": return new My$View();
            case "anonymous": return new ViewGroup() {
            };
            default: throw new IllegalArgumentException("unknown view class " + key);
        }
    }

    // One tree a line:
    //   <viewport top> <viewport bottom> <density> <font scale> <count>, then for each view in
    //   pre-order: <depth> <class> <globally visible> <visible rect left top right bottom>
    //   <screen x> <screen y> <height> <id>
    // Each answers one line: the JSON getInspectorData resolved, in hex, or "error <code>".
    static void recordInspectorTrees(String file) throws Exception {
        for (String line : Files.readAllLines(Paths.get(file))) {
            if (line.isBlank()) continue;
            Iterator<String> words = java.util.Arrays.asList(line.trim().split(" ")).iterator();
            int viewportTop = Integer.parseInt(words.next());
            int viewportBottom = Integer.parseInt(words.next());
            Resources resources = new Resources();
            resources.displayMetrics.density = Float.parseFloat(words.next());
            resources.configuration.fontScale = Float.parseFloat(words.next());
            int count = Integer.parseInt(words.next());

            List<View> ancestors = new ArrayList<>();
            View root = null;
            for (int index = 0; index < count; index++) {
                int depth = Integer.parseInt(words.next());
                View view = viewOfClass(words.next());
                view.globallyVisible = words.next().equals("1");
                view.globalVisibleRect = new Rect(Integer.parseInt(words.next()), Integer.parseInt(words.next()),
                        Integer.parseInt(words.next()), Integer.parseInt(words.next()));
                view.screenX = Integer.parseInt(words.next());
                view.screenY = Integer.parseInt(words.next());
                view.height = Integer.parseInt(words.next());
                view.id = Integer.parseInt(words.next());

                while (ancestors.size() > depth) ancestors.remove(ancestors.size() - 1);
                if (depth == 0) {
                    root = view;
                } else {
                    ((ViewGroup) ancestors.get(ancestors.size() - 1)).children.add(view);
                }
                ancestors.add(view);
            }
            root.resources = resources;
            root.windowVisibleDisplayFrame = new Rect(0, viewportTop, 0, viewportBottom);

            Activity activity = new Activity();
            activity.window.decorView = root;
            final String[] answer = new String[1];
            InspectorHelper.getInspectorData(activity, new Promise() {
                public void resolve(Object value) {
                    answer[0] = hex((String) value);
                }

                public void reject(String code, String message) {
                    answer[0] = "error " + code;
                }

                public void reject(String code, String message, Throwable error) {
                    answer[0] = "error " + code;
                }
            });
            System.out.println(answer[0]);
        }
    }

    private static String hex(String text) {
        StringBuilder out = new StringBuilder();
        for (byte value : text.getBytes(java.nio.charset.StandardCharsets.UTF_8)) {
            out.append(String.format("%02x", value & 0xFF));
        }
        return out.toString();
    }
}
