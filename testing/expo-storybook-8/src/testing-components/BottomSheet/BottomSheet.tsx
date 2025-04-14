import React, { useEffect, useRef } from 'react';
import { Text, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';

const BottomSheetComponent = () => {
  const bottomSheetRef = useRef<BottomSheet>(null);

  useEffect(() => {
    bottomSheetRef.current?.expand();
  }, []);

  return (
    <GestureHandlerRootView style={styles.container} testID="gesture-handler-root-view">
      <BottomSheet ref={bottomSheetRef}>
        <BottomSheetView style={styles.contentContainer} testID="bottom-sheet-view">
          <Text testID="bottom-sheet-text">Awesome 🎉</Text>
        </BottomSheetView>
      </BottomSheet>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'grey',
  },
  contentContainer: {
    flex: 1,
    padding: 36,
    alignItems: 'center',
  },
});

export default BottomSheetComponent;
