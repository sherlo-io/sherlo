// A swipe's finger goes down on the middle of its view and moves most of the way to the view's edge
// in the step's direction, never past it, so it stays on the view it drags. The swipe as a played
// step, and why a touch never reached its view, are tested through the steps (playSteps.test.ts).
import { swipeLine, tapInPopup, windowToTouch } from '../nativeTouch';

const native = vi.hoisted(() => ({
  windows: [] as unknown[],
  touches: [] as number[][],
}));

vi.mock('../SherloModule', () => ({
  default: {
    getWindowViews: async () => native.windows,
    tapInWindow: async (x: number, y: number, _holdMs: number, windowIndex: number) => {
      native.touches.push([x, y, windowIndex]);
      return { reachedReact: false, hitTag: -1, hitClass: 'UIAlertActionView', missing: [] };
    },
  },
}));

const ROW = { x: 0, y: 200, width: 390, height: 100 };

describe('the line a swipe drags along', () => {
  it("starts at the view's middle and ends nine tenths of the way to its edge in each direction", () => {
    expect(swipeLine(ROW, 'left')).toEqual({ fromX: 195, fromY: 250, toX: 19.5, toY: 250 });
    expect(swipeLine(ROW, 'right')).toEqual({ fromX: 195, fromY: 250, toX: 370.5, toY: 250 });
    expect(swipeLine(ROW, 'up')).toEqual({ fromX: 195, fromY: 250, toX: 195, toY: 205 });
    expect(swipeLine(ROW, 'down')).toEqual({ fromX: 195, fromY: 250, toX: 195, toY: 295 });
  });

  it('stays inside a view that does not start at the window edge', () => {
    const card = { x: 100, y: 400, width: 200, height: 40 };

    const { toX } = swipeLine(card, 'left');
    expect(toX).toBeGreaterThan(card.x);
    expect(swipeLine(card, 'right').toX).toBeLessThan(card.x + card.width);
  });
});

describe('the window a tap is sent to', () => {
  const okButton = { label: 'OK', frame: { x: 100, y: 400, width: 190, height: 44 } };
  const appWindow = {
    name: 'UIWindow',
    views: [{ ...okButton, frame: { ...okButton.frame, y: 100 } }],
  };
  const alertWindow = { name: '_UIAlertControllerShimPresenterWindow', views: [okButton] };

  beforeEach(() => {
    native.windows = [alertWindow, appWindow];
    native.touches = [];
  });

  it("a tap on a pop-up button is sent to the topmost window, not the app's root window", async () => {
    // Windows come topmost first; the app also has an "OK" (at y 100), but the alert covers it.
    expect(windowToTouch([alertWindow, appWindow], 'OK')?.window).toBe(alertWindow.name);
    expect(await tapInPopup({ label: 'OK' }, 50, 'tap')).toBeUndefined();
    // The point and the place of the alert's window in the list, handed to the native touch.
    expect(native.touches).toEqual([[195, 422, 0]]);
  });

  it('a pop-up tap whose point is covered by a higher window of the same kind still reaches the pop-up', async () => {
    // A higher window of the alert's own class covers its point: the touch names the alert's place
    // in the list (1), never its class, so the cover cannot take it.
    const cover = { name: alertWindow.name, views: [] };
    native.windows = [cover, alertWindow, appWindow];
    expect(await tapInPopup({ label: 'OK' }, 50, 'tap')).toBeUndefined();
    expect(native.touches).toEqual([[195, 422, 1]]);
  });

  it('finds nothing when no window holds the label, and the app window when only it does', () => {
    expect(windowToTouch([alertWindow, appWindow], 'Save')).toBeUndefined();
    expect(windowToTouch([appWindow], 'OK')?.window).toBe('UIWindow');
  });
});
