let isExpoGo: boolean;

try {
  const Constants = require('expo-constants').default;

  isExpoGo = Constants.appOwnership === 'expo';
} catch {
  isExpoGo = false;
}

export default isExpoGo;
