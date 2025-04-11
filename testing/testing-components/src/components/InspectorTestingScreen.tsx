/**
 * InspectorTestingScreen.tsx
 *
 * This screen is designed as a comprehensive test-bed for our metadata
 * extraction system and for stress testing various React Native components.
 * It includes a variety of component types along with multiple style properties,
 * such as border radii, shadows, and elevation. Components demonstrating the use
 * of refs, memoization, and forwardRef are included to simulate real-world scenarios.
 *
 * The goal is to cover as many style and layout properties as possible, including:
 * - Basic components (View, Text)
 * - Advanced styling (individual border radii, shadows, elevation)
 * - Components that use refs and onLayout for measuring
 * - A memoized component (via React.memo) and a forwardRef component
 *   (wrapping TextInput)
 * - A FlatList with various styled items for list performance testing
 * - An Image component with rounded borders and shadows
 *
 * All components are arranged in a flex–wrap grid layout to fit within the
 * visible screen without scrolling, making it ideal for live stress tests
 * or visual regression analysis.
 */

import React, { useRef, useState, useEffect, memo, forwardRef, FC } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  Platform,
  LayoutChangeEvent,
  ScrollView,
} from 'react-native';

// ----- Component Definitions -----

// A memoized component that renders a styled box with various style props.
const MemoBox: FC = memo(() => (
  <View style={styles.memoBox} testID="memo-styled-box">
    <Text style={styles.memoBoxText} testID="memo-box-text">
      Memoized Box
    </Text>
  </View>
));

// A forwardRef component that wraps a TextInput.
const ForwardInput = forwardRef<TextInput, {}>((props, ref) => (
  <TextInput
    ref={ref}
    style={styles.forwardInput}
    placeholder="Forwarded ref input"
    testID="forward-ref-input"
    {...props}
  />
));

// A component that uses a ref to measure its layout.
interface LayoutType {
  x: number;
  y: number;
  width: number;
  height: number;
  pageX: number;
  pageY: number;
}
const RefBox: FC = () => {
  const boxRef = useRef<View>(null);
  const [layout, setLayout] = useState<LayoutType | null>(null);

  const onLayout = (event: LayoutChangeEvent) => {
    if (boxRef.current) {
      // Using measure to capture layout dimensions.
      boxRef.current.measure((x, y, w, h, pageX, pageY) => {
        setLayout({ x, y, width: w, height: h, pageX, pageY });
      });
    }
  };

  return (
    <View ref={boxRef} style={styles.refBox} onLayout={onLayout} testID="ref-measurement-box">
      <Text style={styles.refBoxText} testID="ref-box-text">
        Ref Box
      </Text>
      {layout && (
        <Text style={styles.refLayoutText} testID="ref-layout-dimensions-text">
          {`W: ${layout.width.toFixed(0)} | H: ${layout.height.toFixed(0)}`}
        </Text>
      )}
    </View>
  );
};

// Sample data for FlatList.
interface ListItem {
  id: string;
  title: string;
}
const flatListData: ListItem[] = Array.from({ length: 2 }, (_, i) => ({
  id: i.toString(),
  title: `Item ${i + 1}`,
}));

// A component that renders items in a FlatList with varied styles.
const StyleList: FC = () => (
  <FlatList
    data={flatListData}
    numColumns={2}
    columnWrapperStyle={styles.listColumn}
    contentContainerStyle={styles.listContainer}
    style={styles.list}
    indicatorStyle="white"
    ListFooterComponentStyle={styles.listFooter}
    ListHeaderComponentStyle={styles.listHeader}
    keyExtractor={(item) => item.id}
    testID="style-flat-list"
    renderItem={({ item, index }) => (
      <TouchableOpacity style={styles.listItem} testID={`list-item-${index}`}>
        <Text style={styles.listItemText} testID={`list-item-text-${index}`}>
          {item.title}
        </Text>
      </TouchableOpacity>
    )}
  />
);

// A component that renders a styled ScrollView with all possible styling properties.
const StyledScrollView: FC = () => (
  <ScrollView
    style={styles.styledScrollView}
    contentContainerStyle={styles.scrollViewContent}
    horizontal={false}
    showsVerticalScrollIndicator={true}
    showsHorizontalScrollIndicator={false}
    scrollEnabled={true}
    bounces={true}
    alwaysBounceVertical={true}
    alwaysBounceHorizontal={false}
    bouncesZoom={true}
    decelerationRate="normal"
    keyboardDismissMode="on-drag"
    keyboardShouldPersistTaps="never"
    directionalLockEnabled={true}
    indicatorStyle="black"
    maximumZoomScale={1.5}
    minimumZoomScale={0.5}
    scrollEventThrottle={16}
    scrollsToTop={true}
    testID="styled-scroll-view"
  >
    {Array.from({ length: 2 }).map((_, i) => (
      <View key={i} style={styles.scrollItem} testID={`scroll-item-${i}`}>
        <Text style={styles.scrollItemText} testID={`scroll-item-text-${i}`}>
          Scroll Item {i + 1}
        </Text>
      </View>
    ))}
  </ScrollView>
);

// ----- Main InspectorTestingScreen Component -----
const InspectorTestingScreen: FC = () => {
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.measure((x, y, w, h, pageX, pageY) => {
        console.log('ForwardInput measured: ', { x, y, width: w, height: h, pageX, pageY });
      });
    }
  }, []);

  return (
    <View style={styles.container} testID="inspector-testing-screen-container">
      <Text style={styles.header} testID="inspector-screen-header">
        InspectorTestingScreen
      </Text>

      {/* Grid container to arrange components without scrolling */}
      <View style={styles.grid} testID="components-grid-container">
        {/* Memoized Component */}
        <MemoBox />

        {/* ForwardRef TextInput */}
        <View style={styles.gridItem} testID="forward-ref-input-container">
          <Text style={styles.label} testID="forward-ref-input-label">
            ForwardRef Input
          </Text>
          <ForwardInput ref={inputRef} />
        </View>

        {/* Ref Measurement Example */}
        <View style={styles.gridItem} testID="ref-measurement-container">
          <Text style={styles.label} testID="ref-measurement-label">
            Ref Measurement
          </Text>
          <RefBox />
        </View>

        {/* Image with Styles */}
        <View style={styles.gridItem} testID="styled-image-container">
          <Text style={styles.label} testID="styled-image-label">
            Styled Image
          </Text>
          <Image
            source={{ uri: 'https://reactnative.dev/img/tiny_logo.png' }}
            style={styles.styledImage}
            testID="react-native-logo-image"
          />
        </View>

        {/* Complex Styled View with Individual Border Radii */}
        <View style={styles.gridItem} testID="complex-styled-box-container">
          <Text style={styles.label} testID="complex-styled-box-label">
            Complex Styled Box
          </Text>
          <View style={styles.complexBox} testID="complex-styled-box">
            <Text style={styles.complexBoxText} testID="complex-box-text">
              Rounded Corners, Shadow, Elevation
            </Text>
          </View>
        </View>

        {/* Basic Text Element */}
        <View style={styles.gridItem} testID="plain-text-container">
          <Text style={styles.label} testID="plain-text-label">
            Plain Text
          </Text>
          <Text style={styles.basicText} testID="plain-text-element">
            This is a plain text block with custom styling.
          </Text>
        </View>

        {/* Styled ScrollView */}
        <View style={styles.gridItem} testID="scroll-view-container">
          <Text style={styles.label} testID="scroll-view-label">
            Styled ScrollView
          </Text>
          <StyledScrollView />
        </View>

        {/* FlatList with Styled Items */}
        <View style={styles.gridItem} testID="flat-list-container">
          <Text style={styles.label} testID="flat-list-label">
            Styled FlatList
          </Text>
          <StyleList />
        </View>
      </View>
    </View>
  );
};

export default InspectorTestingScreen;

// ----- Styles -----
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  header: {
    fontSize: 22,
    fontWeight: 'bold',
    marginVertical: 4,
  },
  grid: {
    flex: 1,
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-evenly',
  },
  gridItem: {
    width: '45%',
    marginVertical: 4,
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    marginBottom: 4,
    color: '#333',
  },
  // MemoBox styles with various style props.
  memoBox: {
    width: '90%',
    height: 80,
    backgroundColor: '#98FB98', // Pale green
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#4CAF50',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 4,
  },
  memoBoxText: {
    fontSize: 16,
    fontWeight: '600',
    backgroundColor: '#FFDAB9', // Peachpuff
  },
  // ForwardInput styling.
  forwardInput: {
    height: 40,
    width: '100%',
    borderColor: '#999',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    backgroundColor: '#F0E68C', // Khaki
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: Platform.OS === 'ios' ? 0.3 : 0,
    shadowRadius: 3,
    elevation: 3,
  },
  // RefBox styling.
  refBox: {
    width: '100%',
    height: 60,
    backgroundColor: '#BA55D3', // Medium orchid
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 4,
  },
  refBoxText: {
    fontSize: 16,
    fontWeight: '500',
    backgroundColor: '#B0E0E6', // Powder blue
  },
  refLayoutText: {
    marginTop: 2,
    fontSize: 12,
    color: '#333',
    backgroundColor: '#FFFACD', // Lemon chiffon
  },
  // FlatList item styling.
  listContainer: {
    backgroundColor: '#800080', // Purple
  },
  list: {
    backgroundColor: '#87CEEB', // Sky blue
  },
  listIndicator: {
    backgroundColor: '#FFA07A', // Light salmon
  },
  listFooter: {
    backgroundColor: '#7FFFD4', // Aquamarine
  },
  listHeader: {
    backgroundColor: '#FFC0CB', // Pink
  },
  listColumn: {
    backgroundColor: '#00CED1', // Dark turquoise
    justifyContent: 'space-between',
    width: '100%',
  },
  listItem: {
    backgroundColor: '#D8BFD8', // Thistle
    padding: 8,
    marginVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DDD',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: Platform.OS === 'ios' ? 0.25 : 0,
    shadowRadius: 3,
    elevation: 3,
    flex: 1,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  listItemText: {
    fontSize: 14,
    backgroundColor: '#E6E6FA', // Lavender
  },
  // Image styling with borderRadius and shadow.
  styledImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: '#4CAF50',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: Platform.OS === 'ios' ? 0.3 : 0,
    shadowRadius: 4,
    elevation: 4,
  },
  // Complex box with individual border radii.
  complexBox: {
    width: '100%',
    height: 80,
    backgroundColor: '#FF6347', // Tomato
    borderTopLeftRadius: 20,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 20,
    borderWidth: 1,
    borderColor: '#888',
    shadowColor: '#333',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: Platform.OS === 'ios' ? 0.3 : 0,
    shadowRadius: 4,
    elevation: 4,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 4,
  },
  complexBoxText: {
    fontSize: 14,
    textAlign: 'center',
    backgroundColor: '#B0C4DE', // Light steel blue
  },
  // Basic text styling.
  basicText: {
    fontSize: 14,
    padding: 6,
    borderWidth: 1,
    borderColor: '#CCC',
    borderRadius: 8,
    backgroundColor: '#9ACD32', // Yellow green
    textAlign: 'center',
  },
  // Styled ScrollView
  styledScrollView: {
    width: '100%',
    height: 120,
    backgroundColor: '#FF69B4', // Hot pink
    borderWidth: 1,
    borderColor: '#AAA',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: Platform.OS === 'ios' ? 0.2 : 0,
    shadowRadius: 3,
    elevation: 3,
    padding: 4,
    marginVertical: 4,
  },
  scrollViewContent: {
    padding: 10,
    alignItems: 'center',
    backgroundColor: '#20B2AA', // Light sea green
  },
  scrollItem: {
    width: '100%',
    padding: 8,
    marginVertical: 4,
    backgroundColor: '#DDA0DD', // Plum
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDD',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: Platform.OS === 'ios' ? 0.15 : 0,
    shadowRadius: 2,
    elevation: 2,
  },
  scrollItemText: {
    fontSize: 14,
    textAlign: 'center',
    backgroundColor: '#FAEBD7', // Antique white
  },
});
