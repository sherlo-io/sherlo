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
} from 'react-native';

// ----- Component Definitions -----

// A memoized component that renders a styled box with various style props.
const MemoBox: FC = memo(() => (
  <View style={styles.memoBox}>
    <Text style={styles.memoBoxText}>Memoized Box</Text>
  </View>
));

// A forwardRef component that wraps a TextInput.
const ForwardInput = forwardRef<TextInput, {}>((props, ref) => (
  <TextInput ref={ref} style={styles.forwardInput} placeholder="Forwarded ref input" {...props} />
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
    <View ref={boxRef} style={styles.refBox} onLayout={onLayout}>
      <Text style={styles.refBoxText}>Ref Box</Text>
      {layout && (
        <Text style={styles.refLayoutText}>
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
const flatListData: ListItem[] = Array.from({ length: 6 }, (_, i) => ({
  id: i.toString(),
  title: `Item ${i + 1}`,
}));

// A component that renders items in a FlatList with varied styles.
const StyleList: FC = () => (
  <FlatList
    data={flatListData}
    numColumns={2}
    columnWrapperStyle={styles.listColumn}
    keyExtractor={(item) => item.id}
    renderItem={({ item }) => (
      <TouchableOpacity style={styles.listItem}>
        <Text style={styles.listItemText}>{item.title}</Text>
      </TouchableOpacity>
    )}
  />
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
    <View style={styles.container}>
      <Text style={styles.header}>InspectorTestingScreen</Text>

      {/* Grid container to arrange components without scrolling */}
      <View style={styles.grid}>
        {/* Memoized Component */}
        <MemoBox />

        {/* ForwardRef TextInput */}
        <View style={styles.gridItem}>
          <Text style={styles.label}>ForwardRef Input</Text>
          <ForwardInput ref={inputRef} />
        </View>

        {/* Ref Measurement Example */}
        <View style={styles.gridItem}>
          <Text style={styles.label}>Ref Measurement</Text>
          <RefBox />
        </View>

        {/* Image with Styles */}
        <View style={styles.gridItem}>
          <Text style={styles.label}>Styled Image</Text>
          <Image
            source={{ uri: 'https://reactnative.dev/img/tiny_logo.png' }}
            style={styles.styledImage}
          />
        </View>

        {/* Complex Styled View with Individual Border Radii */}
        <View style={styles.gridItem}>
          <Text style={styles.label}>Complex Styled Box</Text>
          <View style={styles.complexBox}>
            <Text style={styles.complexBoxText}>Rounded Corners, Shadow, Elevation</Text>
          </View>
        </View>

        {/* Basic Text Element */}
        <View style={styles.gridItem}>
          <Text style={styles.label}>Plain Text</Text>
          <Text style={styles.basicText}>This is a plain text block with custom styling.</Text>
        </View>

        {/* FlatList with Styled Items */}
        <View style={[styles.gridItem, { flex: 1 }]}>
          <Text style={styles.label}>Styled FlatList</Text>
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
    backgroundColor: '#EFEFEF',
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
    backgroundColor: '#FFF',
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
  },
  // ForwardInput styling.
  forwardInput: {
    height: 40,
    width: '100%',
    borderColor: '#999',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    backgroundColor: '#FFF',
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
    backgroundColor: '#FFD700',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 4,
  },
  refBoxText: {
    fontSize: 16,
    fontWeight: '500',
  },
  refLayoutText: {
    marginTop: 2,
    fontSize: 12,
    color: '#333',
  },
  // FlatList item styling.
  listColumn: {
    justifyContent: 'space-between',
    width: '100%',
  },
  listItem: {
    backgroundColor: '#FFF',
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
    backgroundColor: '#FFF',
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
  },
  // Basic text styling.
  basicText: {
    fontSize: 14,
    padding: 6,
    borderWidth: 1,
    borderColor: '#CCC',
    borderRadius: 8,
    backgroundColor: '#FFF',
    textAlign: 'center',
  },
});
