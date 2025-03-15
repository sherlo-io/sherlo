import { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { VERIFICATION_TEST_ID } from '../../constants';

function VerificationMode(): ReactElement {
  return (
    <View
      testID={VERIFICATION_TEST_ID}
      style={{
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Text>✔️ SHERLO SETUP WAS DONE CORRECTLY</Text>
      <Text>make sure to remove addVerificationMenuItem from your code now</Text>
    </View>
  );
}

export default VerificationMode;
