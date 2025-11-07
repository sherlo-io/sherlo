import React, { useEffect, useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';

const StoryDecorator =
  ({ placement }: { placement?: 'top' | 'center' | 'bottom' } = {}) =>
  (Story: React.FC<any>) => {
    const theme = useColorScheme();
    const [locale, setLocale] = useState<string | undefined>(undefined);
    const [forceUpdate, setForceUpdate] = useState(0);

    // Poll the cache to detect variant changes and force re-render
    useEffect(() => {
      let lastStoryId: string | null = null;
      const interval = setInterval(() => {
        try {
          const globalAny = global as any;
          const cache = globalAny.__SHERLO_VARIANT_CACHE__;
          const currentStoryId = cache?.currentStoryId;
          
          // Check if story actually changed
          if (currentStoryId && currentStoryId !== lastStoryId) {
            lastStoryId = currentStoryId;
            
            // Variant changed - force re-render by updating state
            setForceUpdate(prev => prev + 1);
            
            // Also read locale dynamically from expo-localization
            const Localization = require('expo-localization');
            const locales = Localization.getLocales();
            if (locales && locales[0]) {
              const newLocale = locales[0].languageCode;
              setLocale(newLocale);
            }
          }
        } catch (e) {
          // Ignore errors
        }
      }, 200); // Poll every 200ms

      return () => clearInterval(interval);
    }, []); // Empty deps - run once on mount

    let containerStyle = {};

    switch (placement) {
      case 'top':
        containerStyle = styles.top;
        break;
      case 'center':
        containerStyle = styles.center;
        break;
      case 'bottom':
        containerStyle = styles.bottom;
        break;
      default:
        break;
    }

    // Render Story and override locale prop if we have a dynamic value
    // Use forceUpdate as key to force re-render when variant changes
    // Also read locale fresh on each render to ensure we get the latest value
    let currentLocale = locale;
    try {
      const Localization = require('expo-localization');
      const locales = Localization.getLocales();
      if (locales && locales[0]) {
        currentLocale = locales[0].languageCode;
      }
    } catch (e) {
      // Ignore
    }
    
    const storyElement = <Story key={forceUpdate} />;
    const storyWithLocale = currentLocale && React.isValidElement(storyElement)
      ? React.cloneElement(storyElement as React.ReactElement<any>, { locale: currentLocale })
      : storyElement;

    return (
      <View
        style={[
          containerStyle,
          {
            flex: 1,
            backgroundColor: theme === 'dark' ? '#333' : '#dfdfdf',
          },
        ]}
      >
        {storyWithLocale}
      </View>
    );
  };

const styles = StyleSheet.create({
  top: {
    justifyContent: 'flex-start',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottom: {
    justifyContent: 'flex-end',
  },
});

export default StoryDecorator;
