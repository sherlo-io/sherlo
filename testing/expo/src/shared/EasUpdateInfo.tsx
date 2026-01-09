import { StyleSheet, View } from 'react-native';
import InfoItem from './InfoItem';

interface EasUpdateInfoProps {
  update: {
    id: string;
    runtimeVersion: string;
    createdAt: Date;
  };
}

const EasUpdateInfo = ({ update }: EasUpdateInfoProps) => {
  return (
    <View style={[styles.container]}>
      {update.id ? (
        <>
          <InfoItem iconName="mobile" text={`Runtime Version: ${update.runtimeVersion}`} />
          <InfoItem
            iconName="update"
            text={`Update (${update.createdAt?.toLocaleString('en-US', {
              month: '2-digit',
              day: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
            })}) with ID:`}
          />
          <InfoItem text={update.id} />
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

export default EasUpdateInfo;
