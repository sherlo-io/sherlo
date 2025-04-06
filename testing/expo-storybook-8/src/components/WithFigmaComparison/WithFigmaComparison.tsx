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
    width: 320,
    height: 320,
    padding: 15,
    backgroundColor: '#D3D3D3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  redRectangle: {
    flex: 1,
    backgroundColor: '#FF0000',
    justifyContent: 'center',
  },
  greenBox: {
    position: 'absolute',
    width: 52,
    height: 52,
    backgroundColor: '#008000',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#000000',
    bottom: 10,
    left: 20,
  },
  text: {
    margin: 10,
    paddingVertical: 20,
    fontSize: 17,
    fontFamily: 'Sans-Serif',
    fontWeight: 'bold',
    letterSpacing: 0.5,
    lineHeight: 24,
    textTransform: 'capitalize',
    backgroundColor: '#FFFF00',
    color: '#000000',
    textAlign: 'center',
  },
});

export default WithFigmaComparison;
