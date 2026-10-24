package io.sherlo.storybookreactnative;

import android.app.Activity;
import android.graphics.Rect;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import com.facebook.react.bridge.Promise;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.json.JSONArray;
import org.json.JSONObject;


/**
 * Helper for inspecting the UI view hierarchy of a React Native application.
 * Provides functionality to collect information about views and their properties.
 */
public class InspectorHelper {
    private static final String TAG = "SherloModule:InspectorHelper";

    /**
     * Gets UI inspector data from the current view hierarchy.
     * Runs the data collection on the UI thread and returns a serialized JSON string.
     *
     * @param activity The current activity containing the view hierarchy
     * @param promise Promise to resolve with the inspector data or reject with an error
     */
    public static void getInspectorData(Activity activity, Promise promise) {
        if (activity == null) {
            promise.reject("no_activity", "No current activity");
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                String jsonString = getInspectorDataString(activity);
                promise.resolve(jsonString);
            } catch (Exception e) {
                Log.e(TAG, e.getMessage(), e);
                promise.reject("ERROR_INSPECTOR_DATA", e.getMessage(), e);
            }
        });
    }

    /**
     * Whether each view named by testID is drawn: walks the whole view tree (no viewport culling) as
     * far as the inspector's depth and node limits allow, and resolves a JSON object of
     * `visible` | `invisible` | `absent` | `unreached` by testID. React Native keeps a view's testID
     * in its react_test_id tag. A view is drawn when it, and every view above it, is VISIBLE, has an
     * alpha above the inspector's threshold, is attached to a window and has a width and a height. A
     * testID found twice is `visible` when any view carrying it is. A testID not found after the walk
     * was cut short at a limit is `unreached`: nothing can be said of it.
     *
     * @param activity The current activity containing the view hierarchy
     * @param testIDsJson A JSON list of the testIDs to look for
     * @param promise Promise to resolve with the JSON object or reject with an error
     */
    public static void getViewVisibility(Activity activity, String testIDsJson, Promise promise) {
        if (activity == null) {
            promise.reject("no_activity", "No current activity");
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                String unusableReason = CompiledCore.unusableReason();
                if (unusableReason != null) {
                    throw new IllegalStateException("The C core cannot bound the view walk: " + unusableReason);
                }
                JSONArray testIDs = new JSONArray(testIDsJson);
                Set<String> wanted = new HashSet<>();
                for (int i = 0; i < testIDs.length(); i++) {
                    wanted.add(testIDs.getString(i));
                }

                Map<String, String> found = new HashMap<>();
                int[] nodeCount = {0};
                boolean[] cutShort = {false};
                findViews(activity.getWindow().getDecorView().getRootView(), wanted, true, 0, nodeCount, found, cutShort);

                JSONObject states = new JSONObject();
                for (int i = 0; i < testIDs.length(); i++) {
                    String testID = testIDs.getString(i);
                    String state = found.get(testID);
                    states.put(testID, state != null ? state : (cutShort[0] ? "unreached" : "absent"));
                }
                promise.resolve(states.toString());
            } catch (Exception e) {
                Log.e(TAG, e.getMessage(), e);
                promise.reject("ERROR_VIEW_VISIBILITY", e.getMessage(), e);
            }
        });
    }

    /**
     * Records the state of each wanted testID that `view` or a view below it carries, then walks into
     * its children while the inspector's limits leave room.
     */
    private static void findViews(View view, Set<String> wanted, boolean ancestorsDrawn, int depth,
                                  int[] nodeCount, Map<String, String> found, boolean[] cutShort) {
        nodeCount[0]++;
        boolean drawn = ancestorsDrawn
                && view.getVisibility() == View.VISIBLE
                && view.getAlpha() > 0.01f
                && view.isAttachedToWindow()
                && view.getWidth() > 0
                && view.getHeight() > 0;

        Object testID = view.getTag(com.facebook.react.R.id.react_test_id);
        if (testID instanceof String && wanted.contains(testID)) {
            // One drawn view is enough for visible; an invisible one never overwrites it.
            if (drawn) {
                found.put((String) testID, "visible");
            } else if (!found.containsKey(testID)) {
                found.put((String) testID, "invisible");
            }
        }

        if (view instanceof ViewGroup) {
            ViewGroup viewGroup = (ViewGroup) view;
            for (int i = 0; i < viewGroup.getChildCount(); i++) {
                if (!CompiledCore.nativeInspectorHasRoom(depth + 1, nodeCount[0])) {
                    cutShort[0] = true;
                    break;
                }
                findViews(viewGroup.getChildAt(i), wanted, drawn, depth + 1, nodeCount, found, cutShort);
            }
        }
    }

    /**
     * Collects and serializes data about the view hierarchy.
     * Walks the views that intersect the current screen viewport, and has the C core write them,
     * with the device metrics, as JSON.
     *
     * @param activity The activity containing the view hierarchy
     * @return JSON string representing the view hierarchy and device metrics
     */
    private static String getInspectorDataString(Activity activity) {
        String unusableReason = CompiledCore.unusableReason();
        if (unusableReason != null) {
            throw new IllegalStateException("The C core cannot write the inspector data: " + unusableReason);
        }

        View rootView = activity.getWindow().getDecorView().getRootView();
        android.content.res.Resources resources = rootView.getResources();

        // Determine the visible viewport bounds (screen coordinates)
        Rect screenRect = new Rect();
        rootView.getWindowVisibleDisplayFrame(screenRect);

        // Walk the view hierarchy, clipped to the viewport
        InspectorWalk walk = new InspectorWalk(screenRect.top, screenRect.bottom);
        collectView(rootView, 0, 0, 0, walk);

        String json = CompiledCore.nativeInspectorJson(walk.nodeNumbers, walk.nodeCount,
                walk.classNames.toArray(new String[0]), resources.getDisplayMetrics().density,
                resources.getConfiguration().fontScale, walk.viewportTop, walk.viewportBottom);
        if (json == null) {
            throw new IllegalStateException("The C core could not write the inspector data as JSON");
        }
        return json;
    }

    /**
     * The views the walk keeps, in pre-order, as the C core reads them: the numbers of each node
     * (in the order CompiledCore.nativeInspectorJson reads them), and the table of class names
     * the nodes point into.
     */
    private static final class InspectorWalk {
        final int viewportTop;
        final int viewportBottom;
        int[] nodeNumbers = new int[256 * CompiledCore.NUMBERS_PER_INSPECTOR_NODE];
        int nodeCount = 0;
        final List<String> classNames = new ArrayList<>();
        private final Map<Class<?>, Integer> classIndexes = new HashMap<>();

        InspectorWalk(int viewportTop, int viewportBottom) {
            this.viewportTop = viewportTop;
            this.viewportBottom = viewportBottom;
        }

        int classIndexOf(View view) {
            Class<?> viewClass = view.getClass();
            Integer known = classIndexes.get(viewClass);
            if (known != null) return known;
            int index = classNames.size();
            classNames.add(viewClass.getSimpleName());
            classIndexes.put(viewClass, index);
            return index;
        }

        void addNode(int depth, int classIndex, boolean isVisible, Rect rect, int id, int top, int bottom) {
            int at = nodeCount * CompiledCore.NUMBERS_PER_INSPECTOR_NODE;
            if (at + CompiledCore.NUMBERS_PER_INSPECTOR_NODE > nodeNumbers.length) {
                nodeNumbers = Arrays.copyOf(nodeNumbers, nodeNumbers.length * 2);
            }
            nodeNumbers[at] = depth;
            nodeNumbers[at + 1] = classIndex;
            nodeNumbers[at + 2] = isVisible ? 1 : 0;
            nodeNumbers[at + 3] = rect.left;
            nodeNumbers[at + 4] = rect.top;
            nodeNumbers[at + 5] = rect.width();
            nodeNumbers[at + 6] = rect.height();
            nodeNumbers[at + 7] = id > 0 ? 1 : 0;
            nodeNumbers[at + 8] = id;
            nodeNumbers[at + 9] = top;
            nodeNumbers[at + 10] = bottom;
            nodeCount++;
        }
    }

    /**
     * Keeps one node for a view, then walks into its children.
     * Before each child the C core says whether the tree has room for it (depth and node limits)
     * and whether it intersects the viewport [viewportTop, viewportBottom]. A child it leaves out is
     * not walked into: parent containers that span beyond the viewport are kept (they intersect
     * it), but their off-screen children are skipped.
     *
     * @param view The view to collect information from
     * @param depth Current recursion depth
     * @param top The view's top edge in screen coordinates (not read for the root)
     * @param bottom The view's bottom edge in screen coordinates (not read for the root)
     * @param walk The nodes kept so far, and the viewport
     */
    private static void collectView(View view, int depth, int top, int bottom, InspectorWalk walk) {
        int classIndex = walk.classIndexOf(view);

        // Check visibility, and the position and dimensions on screen
        Rect rect = new Rect();
        boolean isVisible = view.getGlobalVisibleRect(rect);

        // Native ID
        int nativeTag = view.getId();

        walk.addNode(depth, classIndex, isVisible, rect, nativeTag, top, bottom);

        if (view instanceof ViewGroup) {
            ViewGroup viewGroup = (ViewGroup) view;
            for (int i = 0; i < viewGroup.getChildCount(); i++) {
                if (!CompiledCore.nativeInspectorHasRoom(depth + 1, walk.nodeCount)) {
                    break;
                }

                View child = viewGroup.getChildAt(i);

                // Get child's position in screen coordinates
                int[] childLocation = new int[2];
                child.getLocationOnScreen(childLocation);
                int childTop = childLocation[1];
                int childBottom = childTop + child.getHeight();

                // Skip children entirely outside the viewport
                if (!CompiledCore.nativeInspectorIsOnScreen(childTop, childBottom, walk.viewportTop, walk.viewportBottom)) {
                    continue;
                }

                collectView(child, depth + 1, childTop, childBottom, walk);
            }
        }
    }
}
