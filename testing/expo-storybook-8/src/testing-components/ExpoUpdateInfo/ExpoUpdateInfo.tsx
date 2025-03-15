import { View, StyleSheet } from 'react-native';
import * as Updates from 'expo-updates';
import InfoItem from './InfoItem';

const ExpoUpdateInfo = () => {
  return (
    <View style={[styles.container]}>
      {Updates.updateId ? (
        <>
          <InfoItem
            iconName="mobile-friendly"
            text={`Runtime Version: ${Updates.runtimeVersion}`}
          />
          <InfoItem
            iconName="update"
            text={`Update (${Updates.createdAt?.toLocaleString('en-US', {
              month: '2-digit',
              day: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
            })}) with ID:`}
          />
          <InfoItem text={Updates.updateId} />
        </>
      ) : (
        <InfoItem text={'No update available'} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    paddingHorizontal: 20,
  },
});

export default ExpoUpdateInfo;
