import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const WithFigmaComparison = () => {
  return (
    <View style={styles.container}>
      <View style={styles.purpleBar}>
        <View style={styles.greenBox} />
      </View>
      <View style={styles.greyContainer}>
        <View style={styles.redRectangle}>
          <Text style={styles.text}>This component will be compared to the Figma design</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  purpleBar: {
    width: 'auto',
    marginHorizontal: 36,
    height: 20,
    backgroundColor: '#800080',
    marginBottom: 48,
    alignSelf: 'stretch',
  },
  greyContainer: {
    width: 282,
    height: 282,
    backgroundColor: '#D3D3D3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  redRectangle: {
    width: 230,
    height: 230,
    backgroundColor: '#FF0000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  greenBox: {
    position: 'absolute',
    width: 52,
    height: 52,
    backgroundColor: '#008000',
    bottom: 10,
    left: 20,
  },
  text: {
    fontSize: 17,
    color: '#FFFFFF',
    textAlign: 'center',
  },
});

export default WithFigmaComparison;
