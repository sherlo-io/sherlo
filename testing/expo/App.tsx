import React from 'react';
import { isStorybookMode, addStorybookToDevMenu } from '@sherlo/react-native-storybook';
import { StatusBar } from 'expo-status-bar';
import Storybook from './.rnstorybook';
import HomeScreen from './src/HomeScreen';

// Import all mocked modules to test they work in real app context
import { formatCurrency, APP_NAME, VERSION } from './src/testing-components/utils/localUtils';
import { fetchUserData } from './src/testing-components/utils/asyncUtils';
import { DataProcessor } from './src/testing-components/utils/dataProcessor';
import { processPayment } from './src/testing-components/utils/nestedUtils';
import { createMultiplier } from './src/testing-components/utils/edgeCaseUtils';
import { client as apiClient } from './src/testing-components/api/client';
import { client as apolloClient } from './src/apollo/client';
import { getLocales } from 'expo-localization';

addStorybookToDevMenu();

// Test all mocked modules in real app context (should use real implementations)
function testMockedModulesInRealApp() {
  console.log('[APP] Testing mocked modules in real app context...');
  
  try {
    // Test localUtils
    console.log('[APP] formatCurrency:', formatCurrency(100));
    console.log('[APP] APP_NAME:', APP_NAME);
    console.log('[APP] VERSION:', VERSION);
    
    // Test asyncUtils
    fetchUserData('123').then(data => console.log('[APP] fetchUserData:', data));
    
    // Test DataProcessor class
    const processor = new DataProcessor('test');
    console.log('[APP] DataProcessor instance:', processor);
    console.log('[APP] DataProcessor.process:', processor.process('data'));
    
    // Test static method
    if (DataProcessor.getInstance) {
      const instance = DataProcessor.getInstance();
      console.log('[APP] DataProcessor.getInstance:', instance);
    }
    
    // Test nestedUtils
    console.log('[APP] processPayment:', processPayment(100, 'USD'));
    
    // Test edgeCaseUtils
    const multiplier = createMultiplier(5);
    console.log('[APP] createMultiplier(5)(10):', multiplier(10));
    
    // Test API client
    console.log('[APP] apiClient:', apiClient);
    console.log('[APP] apiClient.query:', typeof apiClient.query);
    
    // Test Apollo client
    console.log('[APP] apolloClient:', apolloClient);
    console.log('[APP] apolloClient.query:', typeof apolloClient.query);
    
    // CRITICAL TEST: This is what was failing before the fix
    // When default export was accessed, it was returning wrapper functions
    // instead of the real client object, causing watchQuery to be undefined
    if (apolloClient && typeof apolloClient.query === 'function') {
      console.log('[APP] ✅ apolloClient.query is a function');
      
      // Test that watchQuery exists (this was the failing case)
      if (apolloClient.watchQuery) {
        console.log('[APP] ✅ apolloClient.watchQuery exists');
      } else {
        console.error('[APP] ❌ apolloClient.watchQuery is undefined - BUG NOT FIXED!');
      }
    } else {
      console.error('[APP] ❌ apolloClient.query is not a function');
    }
    
    // Test expo-localization
    console.log('[APP] getLocales:', getLocales());
    
    console.log('[APP] ✅ All mocked modules work in real app context!');
  } catch (error) {
    console.error('[APP] ❌ Error testing mocked modules:', error);
  }
}

function App() {
  // Test mocked modules on app start
  React.useEffect(() => {
    if (!isStorybookMode) {
      testMockedModulesInRealApp();
    }
  }, []);

  if (isStorybookMode) {
    return (
      <Wrapper>
        <Storybook />
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <HomeScreen />
    </Wrapper>
  );
}

export default App;

/* ========================================================================== */

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StatusBar translucent />

      {children}
    </>
  );
}
