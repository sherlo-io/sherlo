import React from 'react';
import { TextInput, StyleSheet } from 'react-native';

const FocusedInput = () => {
  return (
    <TextInput
      style={styles.input}
      /**
       * This input will be focused automatically
       * and blinking caret will be displayed
       */
      autoFocus
      placeholder="Enter text here"
      placeholderTextColor="#999"
    />
  );
};

const styles = StyleSheet.create({
  input: {
    width: 300,
    height: 50,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#333',
  },
});

export default FocusedInput;
