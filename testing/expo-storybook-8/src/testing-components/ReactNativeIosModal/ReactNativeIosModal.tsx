// Note: Created based on `example/src_old/ModalViewTest0.js`

import * as React from 'react';
import { useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';

import { ModalView } from 'react-native-ios-modal';

function ReactNativeIosModal() {
  const modalRef = React.useRef<ModalView>(null);

  useEffect(() => {
    modalRef.current.setVisibility(true);
  }, []);

  return (
    <ModalView ref={modalRef} containerStyle={styles.modalContainer}>
      <View style={styles.modalCard}>
        <Text>Hello from React Native iOS Modal</Text>
      </View>
    </ModalView>
  );
}

export const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    alignSelf: 'stretch',
    backgroundColor: 'white',
  },
});

export default ReactNativeIosModal;
