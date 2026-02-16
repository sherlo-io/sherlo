/**
 * Tests for SDK protocol types and message construction.
 * Verifies that protocol messages match the expected schema (SDK-CONT-001 through SDK-CONT-005).
 *
 * Since AppProtocolItem and RunnerProtocolItem are TypeScript types,
 * these tests validate the runtime shape of constructed messages.
 */
import {
  AppProtocolItem,
  RunnerProtocolItem,
  ProtocolItemMetadata,
  AckStartProtocolItem,
  AckRequestSnapshotProtocolItem,
  AckScrollRequestProtocolItem,
} from '../helpers/RunnerBridge/types';
import { Snapshot } from '../types/types';

const makeSnapshot = (overrides: Partial<Snapshot> = {}): Snapshot => ({
  viewId: 'components-button--primary-deviceHeight',
  mode: 'deviceHeight',
  displayName: 'components/Button - Primary',
  storyId: 'components-button--primary',
  componentId: 'components-button',
  componentTitle: 'components/Button',
  storyTitle: 'Primary',
  parameters: {},
  argTypes: {},
  args: {},
  ...overrides,
});

describe('Protocol message construction', () => {
  describe('START message (SDK-CONT-001)', () => {
    it('has correct structure with action and snapshots', () => {
      const snapshots = [makeSnapshot(), makeSnapshot({ storyId: 'btn--secondary' })];
      const msg: AppProtocolItem = {
        action: 'START',
        snapshots,
      };

      expect(msg.action).toBe('START');
      expect(msg.snapshots).toHaveLength(2);
      expect(msg.snapshots[0].storyId).toBe('components-button--primary');
    });

    it('snapshot contains all required fields', () => {
      const snapshot = makeSnapshot();
      const msg: AppProtocolItem = {
        action: 'START',
        snapshots: [snapshot],
      };

      const s = msg.snapshots[0];
      expect(s).toHaveProperty('viewId');
      expect(s).toHaveProperty('mode');
      expect(s).toHaveProperty('displayName');
      expect(s).toHaveProperty('storyId');
      expect(s).toHaveProperty('componentId');
      expect(s).toHaveProperty('componentTitle');
      expect(s).toHaveProperty('storyTitle');
      expect(s).toHaveProperty('parameters');
      expect(s).toHaveProperty('argTypes');
      expect(s).toHaveProperty('args');
    });
  });

  describe('REQUEST_SNAPSHOT message (SDK-CONT-002)', () => {
    it('has all metadata fields for v1.3.0+', () => {
      const msg: AppProtocolItem = {
        action: 'REQUEST_SNAPSHOT',
        hasError: false,
        inspectorData: '{"viewHierarchy":{}}',
        isStable: true,
        requestId: 'req-123',
        hasNetworkImage: true,
        isScrollableSnapshot: false,
        isAtEnd: true,
        scrollOffset: 0,
        safeAreaMetadata: {
          shouldAddSafeArea: true,
          insetBottom: 102,
          insetTop: 141,
          isStorybook7: false,
        },
      };

      expect(msg.action).toBe('REQUEST_SNAPSHOT');
      expect(msg.requestId).toBe('req-123');
      expect(msg.hasError).toBe(false);
      expect(msg.isStable).toBe(true);
      expect(msg.hasNetworkImage).toBe(true);
      expect(msg.isScrollableSnapshot).toBe(false);
      expect(msg.isAtEnd).toBe(true);
      expect(msg.scrollOffset).toBe(0);
      expect(msg.safeAreaMetadata).toBeDefined();
    });

    it('safeAreaMetadata has correct structure (SDK-CONT-003)', () => {
      const msg: AppProtocolItem = {
        action: 'REQUEST_SNAPSHOT',
        requestId: 'req-456',
        safeAreaMetadata: {
          shouldAddSafeArea: true,
          insetBottom: 102,
          insetTop: 141,
          isStorybook7: true,
        },
      };

      const meta = msg.safeAreaMetadata!;
      expect(meta).toHaveProperty('shouldAddSafeArea');
      expect(meta).toHaveProperty('insetBottom');
      expect(meta).toHaveProperty('insetTop');
      expect(meta).toHaveProperty('isStorybook7');
      expect(typeof meta.shouldAddSafeArea).toBe('boolean');
      expect(typeof meta.insetBottom).toBe('number');
      expect(typeof meta.insetTop).toBe('number');
      expect(typeof meta.isStorybook7).toBe('boolean');
    });

    it('allows optional fields to be undefined', () => {
      const msg: AppProtocolItem = {
        action: 'REQUEST_SNAPSHOT',
        requestId: 'req-minimal',
      };

      expect(msg.hasError).toBeUndefined();
      expect(msg.inspectorData).toBeUndefined();
      expect(msg.isStable).toBeUndefined();
      expect(msg.hasNetworkImage).toBeUndefined();
      expect(msg.safeAreaMetadata).toBeUndefined();
    });
  });

  describe('JS_LOADED message (SDK-CONT-004)', () => {
    it('has correct structure', () => {
      const msg: AppProtocolItem = {
        action: 'JS_LOADED',
      };

      expect(msg.action).toBe('JS_LOADED');
    });

    it('supports optional requestId', () => {
      const msg: AppProtocolItem = {
        action: 'JS_LOADED',
        requestId: 'init-123',
      };

      expect(msg.requestId).toBe('init-123');
    });
  });

  describe('Protocol metadata envelope', () => {
    it('adds timestamp and entity to message', () => {
      const content: AppProtocolItem & ProtocolItemMetadata = {
        action: 'JS_LOADED',
        timestamp: Date.now(),
        entity: 'app',
      };

      expect(content.entity).toBe('app');
      expect(typeof content.timestamp).toBe('number');
    });
  });

  describe('Runner response messages', () => {
    it('ACK_START contains nextSnapshot and requestId', () => {
      const ack: AckStartProtocolItem = {
        action: 'ACK_START',
        nextSnapshot: makeSnapshot(),
        requestId: 'ack-start-123',
      };

      expect(ack.action).toBe('ACK_START');
      expect(ack.nextSnapshot.storyId).toBe('components-button--primary');
      expect(ack.requestId).toBe('ack-start-123');
    });

    it('ACK_REQUEST_SNAPSHOT contains nextSnapshot and requestId', () => {
      const ack: AckRequestSnapshotProtocolItem = {
        action: 'ACK_REQUEST_SNAPSHOT',
        nextSnapshot: makeSnapshot({ storyId: 'next--story' }),
        requestId: 'ack-req-456',
      };

      expect(ack.action).toBe('ACK_REQUEST_SNAPSHOT');
      expect(ack.nextSnapshot.storyId).toBe('next--story');
    });

    it('ACK_SCROLL_REQUEST contains scrollIndex and offsetPx (SDK-CONT-005)', () => {
      const ack: AckScrollRequestProtocolItem = {
        action: 'ACK_SCROLL_REQUEST',
        requestId: 'scroll-789',
        scrollIndex: 2,
        offsetPx: 400,
      };

      expect(ack.action).toBe('ACK_SCROLL_REQUEST');
      expect(ack.scrollIndex).toBe(2);
      expect(ack.offsetPx).toBe(400);
      expect(ack.requestId).toBe('scroll-789');
    });

    it('RunnerProtocolItem union covers all three types', () => {
      const items: RunnerProtocolItem[] = [
        { action: 'ACK_START', nextSnapshot: makeSnapshot(), requestId: '1' },
        { action: 'ACK_REQUEST_SNAPSHOT', nextSnapshot: makeSnapshot(), requestId: '2' },
        { action: 'ACK_SCROLL_REQUEST', requestId: '3', scrollIndex: 0, offsetPx: 0 },
      ];

      expect(items).toHaveLength(3);
      expect(items.map((i) => i.action)).toEqual([
        'ACK_START',
        'ACK_REQUEST_SNAPSHOT',
        'ACK_SCROLL_REQUEST',
      ]);
    });
  });
});
