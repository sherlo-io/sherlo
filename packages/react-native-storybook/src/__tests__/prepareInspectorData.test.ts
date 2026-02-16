import { prepareInspectorData } from '../getStorybook/components/TestingMode/useTestAllStories/prepareInspectorData';
import { InspectorData, InspectorDataNode } from '../types/types';
import { Metadata } from '../getStorybook/components/TestingMode/MetadataProvider';

const makeNode = (overrides: Partial<InspectorDataNode> = {}): InspectorDataNode => ({
  id: 1,
  className: 'View',
  isVisible: true,
  x: 0,
  y: 0,
  width: 300,
  height: 600,
  ...overrides,
});

const makeInspectorData = (
  viewHierarchy: InspectorDataNode,
  density = 1
): InspectorData => ({
  viewHierarchy,
  density,
  fontScale: 1,
});

const makeMetadata = (
  viewProps: Metadata['viewProps'] = {},
  texts: string[] = []
): Metadata => ({
  viewProps,
  texts,
});

describe('prepareInspectorData', () => {
  it('returns deep copy of inspector data (no mutation)', () => {
    const original = makeInspectorData(makeNode());
    const metadata = makeMetadata();

    const { inspectorData } = prepareInspectorData(original, metadata, 'story-id');

    expect(inspectorData).not.toBe(original);
    expect(inspectorData.viewHierarchy).not.toBe(original.viewHierarchy);
  });

  it('calculates adjustedWidth and adjustedHeight based on density', () => {
    const node = makeNode({ id: 1, width: 900, height: 1800 });
    const data = makeInspectorData(node, 3);
    const metadata = makeMetadata();

    const { inspectorData } = prepareInspectorData(data, metadata, 'story-id');

    expect(inspectorData.viewHierarchy.adjustedWidth).toBe(300);
    expect(inspectorData.viewHierarchy.adjustedHeight).toBe(600);
  });

  it('calculates adjusted dimensions with density=1 (no scaling)', () => {
    const node = makeNode({ id: 1, width: 300, height: 600 });
    const data = makeInspectorData(node, 1);
    const metadata = makeMetadata();

    const { inspectorData } = prepareInspectorData(data, metadata, 'story-id');

    expect(inspectorData.viewHierarchy.adjustedWidth).toBe(300);
    expect(inspectorData.viewHierarchy.adjustedHeight).toBe(600);
  });

  it('enriches nodes with className from fabric metadata', () => {
    const node = makeNode({ id: 42 });
    const data = makeInspectorData(node);
    const metadata = makeMetadata({
      42: { className: 'TouchableOpacity' },
    });

    const { inspectorData } = prepareInspectorData(data, metadata, 'story-id');

    expect(inspectorData.viewHierarchy.className).toBe('TouchableOpacity');
  });

  it('enriches nodes with properties from fabric metadata', () => {
    const node = makeNode({ id: 10 });
    const data = makeInspectorData(node);
    const metadata = makeMetadata({
      10: { style: { backgroundColor: 'red' }, testID: 'my-button' },
    });

    const { inspectorData } = prepareInspectorData(data, metadata, 'story-id');

    expect(inspectorData.viewHierarchy.properties).toEqual({
      style: { backgroundColor: 'red' },
      testID: 'my-button',
    });
  });

  it('detects network images and returns hasNetworkImage=true', () => {
    const node = makeNode({ id: 5 });
    const data = makeInspectorData(node);
    const metadata = makeMetadata({
      5: { hasNetworkImage: true },
    });

    const { hasNetworkImage } = prepareInspectorData(data, metadata, 'story-id');

    expect(hasNetworkImage).toBe(true);
  });

  it('returns hasNetworkImage=false when no network images', () => {
    const node = makeNode({ id: 5 });
    const data = makeInspectorData(node);
    const metadata = makeMetadata({
      5: { className: 'View' },
    });

    const { hasNetworkImage } = prepareInspectorData(data, metadata, 'story-id');

    expect(hasNetworkImage).toBe(false);
  });

  it('finds root story node by testID and re-points viewHierarchy', () => {
    const innerChild = makeNode({ id: 3, className: 'Text' });
    const storyRoot = makeNode({
      id: 2,
      className: 'StoryRoot',
      children: [innerChild],
    });
    const wrapper = makeNode({
      id: 1,
      className: 'SherloWrapper',
      children: [storyRoot],
    });
    const data = makeInspectorData(wrapper);
    const metadata = makeMetadata({
      2: { testID: 'btn--primary' },
    });

    const { inspectorData } = prepareInspectorData(data, metadata, 'btn--primary');

    // viewHierarchy should be re-pointed to the storyRoot node
    expect(inspectorData.viewHierarchy.id).toBe(2);
  });

  it('keeps full hierarchy when no testID matches storyId', () => {
    const child = makeNode({ id: 2 });
    const root = makeNode({ id: 1, children: [child] });
    const data = makeInspectorData(root);
    const metadata = makeMetadata({
      2: { testID: 'other-story' },
    });

    const { inspectorData } = prepareInspectorData(data, metadata, 'btn--primary');

    expect(inspectorData.viewHierarchy.id).toBe(1);
  });

  it('does not re-point if matching node has no children', () => {
    const leaf = makeNode({ id: 2 });
    const root = makeNode({ id: 1, children: [leaf] });
    const data = makeInspectorData(root);
    const metadata = makeMetadata({
      2: { testID: 'story-id' },
    });

    const { inspectorData } = prepareInspectorData(data, metadata, 'story-id');

    // Leaf has no children, so viewHierarchy should stay at root
    expect(inspectorData.viewHierarchy.id).toBe(1);
  });

  it('traverses deeply nested children', () => {
    const deepChild = makeNode({ id: 4, width: 120, height: 240 });
    const midChild = makeNode({ id: 3, children: [deepChild] });
    const topChild = makeNode({ id: 2, children: [midChild] });
    const root = makeNode({ id: 1, children: [topChild] });
    const data = makeInspectorData(root, 2);
    const metadata = makeMetadata({
      4: { className: 'DeepView', hasNetworkImage: true },
    });

    const { inspectorData, hasNetworkImage } = prepareInspectorData(
      data,
      metadata,
      'story-id'
    );

    expect(hasNetworkImage).toBe(true);
    // Find the deep child
    const deep =
      inspectorData.viewHierarchy.children![0].children![0].children![0];
    expect(deep.className).toBe('DeepView');
    expect(deep.adjustedWidth).toBe(60);
    expect(deep.adjustedHeight).toBe(120);
  });

  it('handles null viewHierarchy gracefully', () => {
    const data = {
      viewHierarchy: null as any,
      density: 1,
      fontScale: 1,
    };
    const metadata = makeMetadata();

    const { inspectorData, hasNetworkImage } = prepareInspectorData(
      data,
      metadata,
      'story-id'
    );

    expect(inspectorData.viewHierarchy).toBeNull();
    expect(hasNetworkImage).toBe(false);
  });
});
