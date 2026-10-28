// A swipe's finger goes down on the middle of its view and moves most of the way to the view's edge
// in the step's direction, never past it, so it stays on the view it drags. The swipe as a played
// step, and why a touch never reached its view, are tested through the steps (playSteps.test.ts).
import { swipeLine } from '../nativeTouch';

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
